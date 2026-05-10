import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Web Push crypto utilities for Deno/Edge
async function generatePushPayload(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
) {
  // Import VAPID keys
  const pubKeyRaw = base64UrlDecode(vapidPublicKey);
  const privKeyRaw = base64UrlDecode(vapidPrivateKey);

  // Create VAPID JWT
  const now = Math.floor(Date.now() / 1000);
  const audience = new URL(subscription.endpoint).origin;

  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: vapidSubject,
  };

  const headerB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const claimsB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(claims))
  );
  const signingInput = `${headerB64}.${claimsB64}`;

  // Import ECDSA private key for signing
  const ecKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(pubKeyRaw.slice(1, 33)),
      y: base64UrlEncode(pubKeyRaw.slice(33, 65)),
      d: base64UrlEncode(privKeyRaw),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    ecKey,
    new TextEncoder().encode(signingInput)
  );

  // Convert DER signature to raw r||s format
  const sigArray = new Uint8Array(signature);
  let rawSig: Uint8Array;
  if (sigArray[0] === 0x30) {
    // DER encoded
    const rLen = sigArray[3];
    const rStart = 4;
    let r = sigArray.slice(rStart, rStart + rLen);
    const sLen = sigArray[rStart + rLen + 1];
    const sStart = rStart + rLen + 2;
    let s = sigArray.slice(sStart, sStart + sLen);
    // Remove leading zeros and pad to 32 bytes
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    rawSig = new Uint8Array(64);
    rawSig.set(r, 32 - r.length);
    rawSig.set(s, 64 - s.length);
  } else {
    rawSig = sigArray;
  }

  const jwt = `${signingInput}.${base64UrlEncode(rawSig)}`;

  // Encrypt payload using RFC 8291 (aes128gcm)
  const userPublicKey = base64UrlDecode(subscription.keys.p256dh);
  const userAuth = base64UrlDecode(subscription.keys.auth);

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const localPubKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );

  // Import subscriber's public key
  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    userPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberKey },
      localKeyPair.privateKey,
      256
    )
  );

  // Generate 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF-based key derivation (RFC 8291)
  const authInfo = concatBytes(
    new TextEncoder().encode("WebPush: info\0"),
    userPublicKey,
    localPubKey
  );

  const prkKey = await crypto.subtle.importKey(
    "raw",
    userAuth,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const prk = new Uint8Array(
    await crypto.subtle.sign("HMAC", prkKey, sharedSecret)
  );

  const contentKey = await hkdfExpand(
    prk,
    concatBytes(new TextEncoder().encode("Content-Encoding: aes128gcm\0"), authInfo),
    16
  );
  const nonce = await hkdfExpand(
    prk,
    concatBytes(new TextEncoder().encode("Content-Encoding: nonce\0"), authInfo),
    12
  );

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentKey,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  // Add padding delimiter
  const paddedPayload = concatBytes(
    new TextEncoder().encode(payload),
    new Uint8Array([2])
  );

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      paddedPayload
    )
  );

  // Build aes128gcm content coding header
  const recordSize = new ArrayBuffer(4);
  new DataView(recordSize).setUint32(0, encrypted.length + 22);

  const body = concatBytes(
    salt,
    new Uint8Array(recordSize),
    new Uint8Array([65]),
    localPubKey,
    encrypted
  );

  return {
    endpoint: subscription.endpoint,
    headers: {
      Authorization: `vapid t=${jwt}, k=${base64UrlEncode(pubKeyRaw)}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body,
  };
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const input = concatBytes(info, new Uint8Array([1]));
  const output = new Uint8Array(await crypto.subtle.sign("HMAC", key, input));
  return output.slice(0, length);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get VAPID keys from system_config
    const { data: config } = await supabase
      .from("system_config")
      .select("vapid_public_key, vapid_private_key")
      .eq("id", 1)
      .single();

    if (!config?.vapid_public_key || !config?.vapid_private_key) {
      return new Response(
        JSON.stringify({ success: false, error: "VAPID keys not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unsent alerts (same as telegram alerts)
    const { data: allBrands } = await supabase
      .from("brands")
      .select("id, name")
      .eq("is_active", true);

    if (!allBrands || allBrands.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No brands" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;
    let totalFailed = 0;
    let totalRemoved = 0;

    for (const brand of allBrands) {
      // Get unsent alerts for this brand that haven't been push-notified
      const { data: alerts } = await supabase
        .from("alerts")
        .select("id, alert_type, severity, message, chat_id, chat_analysis(overall_score, chat_topic)")
        .eq("brand_id", brand.id)
        .eq("sent_to_telegram", true) // Only send push after telegram is handled
        .is("push_sent_at", null)
        .order("created_at", { ascending: true })
        .limit(20);

      if (!alerts || alerts.length === 0) continue;

      // Get all push subscriptions for users in this brand
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("brand_id", brand.id);

      if (!subscriptions || subscriptions.length === 0) {
        // Mark alerts as push-sent anyway to avoid re-processing
        const alertIds = alerts.map((a: any) => a.id);
        await supabase
          .from("alerts")
          .update({ push_sent_at: new Date().toISOString() })
          .in("id", alertIds);
        continue;
      }

      for (const alert of alerts) {
        const score = alert.chat_analysis?.overall_score ?? "?";
        const topic = alert.chat_analysis?.chat_topic ?? "";
        const severityEmoji =
          alert.severity === "critical" ? "🔴" :
          alert.severity === "high" ? "🟠" : "🟡";

        const pushPayload = JSON.stringify({
          title: alert.alert_type === "missed_chat"
            ? "Kacirilan Chat"
            : `${severityEmoji} Puan: ${score}/100`,
          body: alert.alert_type === "missed_chat"
            ? "Bir chat yanitlanmadan kapandi!"
            : topic
              ? `${topic} - ${alert.severity === "critical" ? "Kritik" : alert.severity === "high" ? "Yuksek" : "Orta"} oncelik`
              : `Dusuk puan tespit edildi (${score}/100)`,
          tag: `alert-${alert.id}`,
          severity: alert.severity,
          alertType: alert.alert_type,
          chatId: alert.chat_id,
          url: alert.alert_type === "missed_chat"
            ? `/all-chats?chat=${alert.chat_id}`
            : `/chats?chat=${alert.chat_id}`,
        });

        for (const sub of subscriptions) {
          try {
            const pushData = await generatePushPayload(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
              },
              pushPayload,
              config.vapid_public_key,
              config.vapid_private_key,
              "mailto:kuzeygodfather@gmail.com"
            );

            const pushResponse = await fetch(pushData.endpoint, {
              method: "POST",
              headers: pushData.headers,
              body: pushData.body,
            });

            if (pushResponse.ok || pushResponse.status === 201) {
              totalSent++;
              await supabase
                .from("push_subscriptions")
                .update({ last_used_at: new Date().toISOString() })
                .eq("id", sub.id);
            } else if (pushResponse.status === 410 || pushResponse.status === 404) {
              // Subscription expired or invalid - remove it
              await supabase.from("push_subscriptions").delete().eq("id", sub.id);
              totalRemoved++;
              console.log(`Removed expired subscription ${sub.id}`);
            } else {
              totalFailed++;
              console.error(
                `Push failed for sub ${sub.id}: ${pushResponse.status} ${await pushResponse.text()}`
              );
            }
          } catch (err) {
            totalFailed++;
            console.error(`Push error for sub ${sub.id}:`, err);
          }
        }

        // Mark alert as push-sent
        await supabase
          .from("alerts")
          .update({ push_sent_at: new Date().toISOString() })
          .eq("id", alert.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        failed: totalFailed,
        removed_expired: totalRemoved,
        brands_processed: allBrands.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Push notification error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

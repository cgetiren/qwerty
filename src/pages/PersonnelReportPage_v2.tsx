// TEMPORARY DEBUG VERSION - Check console logs
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function PersonnelReportPageDebug() {
  const [brandId, setBrandId] = useState<string>("");
  const [debug, setDebug] = useState<any>({});

  useEffect(() => {
    debugLoad();
  }, []);

  async function debugLoad() {
    const log: any = {};
    
    // 1. Get user
    const { data: { user } } = await supabase.auth.getUser();
    log.user = user?.id;
    
    // 2. Get brand
    const { data: brand } = await supabase
      .from("brands")
      .select("id, name")
      .eq("manager_id", user?.id || "")
      .single();
    
    log.brand = brand;
    setBrandId(brand?.id || "");
    
    if (!brand) {
      setDebug(log);
      return;
    }
    
    // 3. Get personnel table
    const { data: personnelData, error: personnelError } = await supabase
      .from("personnel")
      .select("id, name, email, brand_id")
      .eq("brand_id", brand.id);
    
    log.personnel_table = { count: personnelData?.length, data: personnelData, error: personnelError };
    
    // 4. Get chats with personnel
    const { data: chatsData, error: chatsError } = await supabase
      .from("chats")
      .select("id, personnel_id, brand_id, created_at")
      .eq("brand_id", brand.id)
      .not("personnel_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    
    log.chats = { count: chatsData?.length, sample: chatsData?.slice(0, 5), error: chatsError };
    
    // 5. Get chats with personnel JOIN
    const { data: chatsWithPersonnel, error: joinError } = await supabase
      .from("chats")
      .select("id, personnel_id, personnel:personnel_id(id, name, email)")
      .eq("brand_id", brand.id)
      .not("personnel_id", "is", null)
      .limit(10);
    
    log.chats_join = { count: chatsWithPersonnel?.length, data: chatsWithPersonnel, error: joinError };
    
    // 6. Unique personnel from chats
    if (chatsWithPersonnel) {
      const unique = new Map();
      chatsWithPersonnel.forEach((c: any) => {
        if (c.personnel?.id) {
          unique.set(c.personnel.id, c.personnel);
        }
      });
      log.unique_personnel = Array.from(unique.values());
    }
    
    console.log("=== FULL DEBUG LOG ===", log);
    setDebug(log);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">🐛 Personnel Report Debug</h1>
      
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-4">
        <h2 className="font-bold mb-2">Brand ID:</h2>
        <p className="font-mono text-sm">{brandId || "Loading..."}</p>
      </div>
      
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
        <h2 className="font-bold mb-2">Debug Info:</h2>
        <pre className="text-xs overflow-auto max-h-96">
          {JSON.stringify(debug, null, 2)}
        </pre>
      </div>
      
      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        <p>✅ Check console (F12) for full debug log</p>
        <p>✅ Look for "personnel_table", "chats", "chats_join", "unique_personnel"</p>
      </div>
    </div>
  );
}

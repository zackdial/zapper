import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import Auth from "./Auth";
import Zapper from "./Zapper";

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  return session ? <Zapper session={session} /> : <Auth />;
}
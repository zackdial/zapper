import { useState } from "react";
import { supabase } from "./lib/supabase";
import { Zap } from "lucide-react";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signup") {
      const u = username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,32}$/.test(u)) {
        setLoading(false);
        return setError("Username 3-32 characters, sirf a-z, 0-9 aur _");
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: u } },
      });
      if (error) setError(error.message);
      else setError("Account ban gaya. Email confirm karein, phir login karein.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#1e1f22] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-[#313338] rounded-lg p-8 shadow-2xl space-y-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center">
            <Zap className="text-white" size={28} fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            {mode === "login" ? "Wapas aao!" : "Zapper par aao"}
          </h1>
        </div>

        {mode === "signup" && (
          <input
            required value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="Username" className="w-full bg-[#1e1f22] text-white rounded px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-500"
          />
        )}
        <input
          required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Email" className="w-full bg-[#1e1f22] text-white rounded px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-500"
        />
        <input
          required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password" className="w-full bg-[#1e1f22] text-white rounded px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-500"
        />

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button disabled={loading} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded transition-colors">
          {loading ? "Ruko..." : mode === "login" ? "Login" : "Account banayein"}
        </button>

        <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
          className="w-full text-sm text-slate-400 hover:underline">
          {mode === "login" ? "Naya account chahiye? Signup karein" : "Pehle se account hai? Login karein"}
        </button>
      </form>
    </div>
  );
}
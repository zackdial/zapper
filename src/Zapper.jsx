import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hash, Volume2, Plus, Send, Pencil, Trash2, LogOut, Link2, X,
  Users, MessageSquare, UserPlus, Check,
} from "lucide-react";
import { supabase } from "./lib/supabase";

const QUICK = ["👍", "🔥", "⚡", "😂"];

export default function Zapper({ session }) {
  const me = session.user.id;

  // core state
  const [profile, setProfile] = useState(null);
  const [servers, setServers] = useState([]);
  const [serverId, setServerId] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");

  // friends + DMs state
  const [view, setView] = useState("server"); // "server" | "friends" | "dm"
  const [dmUser, setDmUser] = useState(null);
  const [friendships, setFriendships] = useState([]);
  const [friendTab, setFriendTab] = useState("online");
  const [dms, setDms] = useState([]);
  const [dmDraft, setDmDraft] = useState("");

  const endRef = useRef(null);

  const notify = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  const server = servers.find((s) => s.id === serverId) || null;
  const isAdmin = server?.role === "admin";
  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const channel = channels.find((c) => c.id === channelId) || null;

  const nameOf = (u) => u?.display_name || u?.username || "Unknown";

  /* ---------------- loaders ---------------- */

  const loadProfile = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", me).single();
    setProfile(data);
  }, [me]);

  const loadServers = useCallback(async () => {
    const { data, error } = await supabase
      .from("server_members")
      .select("role, servers(id, name, invite_code, owner_id)")
      .eq("user_id", me);
    if (error) return notify(error.message);
    const list = (data || []).filter((r) => r.servers).map((r) => ({ ...r.servers, role: r.role }));
    setServers(list);
    setServerId((cur) => (list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));
  }, [me]);

  const loadChannels = useCallback(async (sid) => {
    if (!sid) return setChannels([]);
    const { data, error } = await supabase
      .from("channels").select("*").eq("server_id", sid).order("created_at");
    if (error) return notify(error.message);
    setChannels(data || []);
    const firstText = (data || []).find((c) => c.type === "text");
    setChannelId((cur) => ((data || []).some((c) => c.id === cur) ? cur : firstText?.id ?? null));
  }, []);

  const loadMessages = useCallback(async (cid) => {
    if (!cid) return setMessages([]);
    const { data, error } = await supabase
      .from("messages")
      .select("id, content, edited, pinned, created_at, author_id, reply_to, author:profiles(id, username, display_name), reactions(emoji, user_id)")
      .eq("channel_id", cid)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return notify(error.message);
    setMessages(data || []);
  }, []);

  const loadFriendships = useCallback(async () => {
    const { data, error } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(id, username, display_name), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name)")
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
    if (error) return notify(error.message);
    setFriendships(data || []);
  }, [me]);

  const loadDMs = useCallback(async (otherId) => {
    const { data, error } = await supabase
      .from("direct_messages")
      .select("id, content, sender_id, created_at")
      .or(`and(sender_id.eq.${me},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${me})`)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return notify(error.message);
    setDms(data || []);
  }, [me]);

  /* ---------------- effects ---------------- */

  useEffect(() => {
    loadProfile();
    loadServers();
    const ch = supabase.channel(`my-servers-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "server_members", filter: `user_id=eq.${me}` }, loadServers)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [me, loadProfile, loadServers]);

  useEffect(() => {
    loadChannels(serverId);
    if (!serverId) return;
    const ch = supabase.channel(`channels-${serverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "channels", filter: `server_id=eq.${serverId}` }, () => loadChannels(serverId))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [serverId, loadChannels]);

  useEffect(() => {
    loadMessages(channelId);
    if (!channelId) return;
    const ch = supabase.channel(`messages-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, () => loadMessages(channelId))
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, () => loadMessages(channelId))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [channelId, loadMessages]);

  useEffect(() => {
    loadFriendships();
    const ch = supabase.channel(`friends-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, loadFriendships)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [me, loadFriendships]);

  useEffect(() => {
    if (view !== "dm" || !dmUser) return;
    loadDMs(dmUser.id);
    const ch = supabase.channel(`dm-${me}-${dmUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, () => loadDMs(dmUser.id))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [view, dmUser, me, loadDMs]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, channelId, dms.length]);

  /* ---------------- derived friend lists ---------------- */

  const otherOf = (f) => (f.requester_id === me ? f.addressee : f.requester);
  const accepted = friendships.filter((f) => f.status === "accepted").map(otherOf);
  const incoming = friendships.filter((f) => f.status === "pending" && f.addressee_id === me);
  const outgoing = friendships.filter((f) => f.status === "pending" && f.requester_id === me);

  /* ---------------- actions: messages ---------------- */

  const send = async () => {
    const text = draft.trim();
    if (!text || !channelId) return;
    setDraft("");
    const { error } = await supabase.from("messages").insert({ channel_id: channelId, author_id: me, content: text });
    if (error) { setDraft(text); notify(error.message); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (text) {
      const { error } = await supabase.from("messages").update({ content: text, edited: true }).eq("id", editing.id);
      if (error) notify(error.message);
    }
    setEditing(null);
  };

  const deleteMessage = async (id) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) notify(error.message);
  };

  const toggleReaction = async (m, emoji) => {
    const mine = m.reactions.some((r) => r.emoji === emoji && r.user_id === me);
    const q = mine
      ? supabase.from("reactions").delete().match({ message_id: m.id, user_id: me, emoji })
      : supabase.from("reactions").insert({ message_id: m.id, user_id: me, emoji });
    const { error } = await q;
    if (error) notify(error.message);
  };

  /* ---------------- actions: servers & channels ---------------- */

  const createServer = async (name) => {
    const { data, error } = await supabase.rpc("create_server", { sname: name });
    if (error) return notify(error.message);
    setModal(null);
    await loadServers();
    setView("server");
    setServerId(data);
    notify(`Server "${name}" ban gaya ✅`);
  };

  const joinServer = async (code) => {
    const { data, error } = await supabase.rpc("join_server", { code: code.trim() });
    if (error) return notify(error.message);
    setModal(null);
    await loadServers();
    setView("server");
    setServerId(data);
    notify("Server join ho gaya ✅");
  };

  const createChannel = async (name, type) => {
    const clean = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!clean) return;
    const { error } = await supabase.from("channels").insert({ server_id: serverId, name: clean, type });
    if (error) return notify(error.message);
    setModal(null);
    notify(`#${clean} ban gaya`);
  };

  const deleteChannel = async (id) => {
    if (!isAdmin) return notify("Sirf admins channel delete kar sakte hain");
    const { error } = await supabase.from("channels").delete().eq("id", id);
    if (error) notify(error.message);
  };

  const copyInvite = () => {
    navigator.clipboard?.writeText(server.invite_code);
    notify(`Invite code copy ho gaya: ${server.invite_code}`);
  };

  /* ---------------- actions: friends & DMs ---------------- */

  const sendFriendRequest = async (uname) => {
    const { error, data } = await supabase.rpc("send_friend_request", { uname: uname.trim().toLowerCase() });
    if (error) return notify(error.message);
    setModal(null);
    notify(data);
    loadFriendships();
  };

  const acceptRequest = async (fromId) => {
    const { error } = await supabase.rpc("accept_friend_request", { from_id: fromId });
    if (error) return notify(error.message);
    loadFriendships();
  };

  const removeFriend = async (otherId) => {
    const { error } = await supabase.rpc("remove_friendship", { other: otherId });
    if (error) return notify(error.message);
    loadFriendships();
  };

  const sendDM = async () => {
    const text = dmDraft.trim();
    if (!text || !dmUser) return;
    setDmDraft("");
    const { error } = await supabase.from("direct_messages").insert({ sender_id: me, receiver_id: dmUser.id, content: text });
    if (error) { setDmDraft(text); notify(error.message); }
  };

  const openDM = (u) => { setDmUser(u); setView("dm"); };

  const logout = () => supabase.auth.signOut();

  /* ---------------- render ---------------- */

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#313338] text-slate-200 font-sans text-[15px]">
      <style>{`
        .custom-scroll::-webkit-scrollbar{width:8px}
        .custom-scroll::-webkit-scrollbar-thumb{background:#1a1b1e;border-radius:4px}
        .custom-scroll{scrollbar-width:thin;scrollbar-color:#1a1b1e transparent}
      `}</style>

      {/* Server rail */}
      <nav className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 gap-2 shrink-0 overflow-y-auto custom-scroll">
        <button
          onClick={() => setView("friends")}
          title="Friends aur DMs"
          className={`w-12 h-12 flex items-center justify-center text-white bg-[#5865f2] transition-all hover:scale-105 ${view !== "server" ? "rounded-xl" : "rounded-3xl hover:rounded-xl"}`}
        >
          <Users size={22} />
        </button>
        <div className="w-8 h-[2px] bg-[#35363c] rounded my-1" />
        {servers.map((s) => (
          <button
            key={s.id}
            onClick={() => { setView("server"); setServerId(s.id); }}
            title={s.name}
            className={`w-12 h-12 flex items-center justify-center text-white font-semibold text-sm bg-violet-600 transition-all hover:scale-105 ${view === "server" && s.id === serverId ? "rounded-xl" : "rounded-3xl hover:rounded-xl"}`}
          >
            {s.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase()}
          </button>
        ))}
        <div className="w-8 h-[2px] bg-[#35363c] rounded my-1" />
        <button onClick={() => setModal("server")} title="Server banayein" className="w-12 h-12 rounded-3xl hover:rounded-xl bg-[#313338] hover:bg-emerald-500 text-emerald-500 hover:text-white flex items-center justify-center transition-all">
          <Plus size={22} />
        </button>
        <button onClick={() => setModal("join")} title="Invite se join karein" className="w-12 h-12 rounded-3xl hover:rounded-xl bg-[#313338] hover:bg-sky-500 text-sky-400 hover:text-white flex items-center justify-center transition-all">
          <Link2 size={20} />
        </button>
      </nav>

      {/* Sidebar */}
      <aside className="w-60 bg-[#2b2d31] flex flex-col shrink-0">
        {view !== "server" ? (
          <>
            <div className="h-12 px-4 flex items-center font-semibold text-white border-b border-[#1e1f22] shadow-sm">Direct Messages</div>
            <div className="flex-1 overflow-y-auto custom-scroll px-2 pt-3">
              <button
                onClick={() => setView("friends")}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded mb-2 ${view === "friends" ? "bg-[#404249] text-white" : "text-slate-400 hover:bg-[#35373c]"}`}
              >
                <Users size={18} /> <span className="text-sm font-medium">Friends</span>
              </button>
              <p className="px-1 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Direct messages</p>
              {accepted.length === 0 && <p className="px-2 text-xs text-slate-500">Abhi koi friend nahi.</p>}
              {accepted.map((u) => (
                <button
                  key={u.id}
                  onClick={() => openDM(u)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 text-sm ${view === "dm" && dmUser?.id === u.id ? "bg-[#404249] text-white" : "text-slate-400 hover:bg-[#35373c]"}`}
                >
                  <div className="w-6 h-6 rounded-full bg-violet-600 text-[10px] font-bold text-white flex items-center justify-center">
                    {(u.username || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <span className="truncate">{nameOf(u)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="h-12 px-4 flex items-center justify-between font-semibold text-white border-b border-[#1e1f22] shadow-sm">
              <span className="truncate">{server?.name ?? "Koi server nahi"}</span>
              {server && (
                <button onClick={copyInvite} title="Invite code copy karein" className="text-slate-400 hover:text-white"><Link2 size={16} /></button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll px-2 pt-3">
              {server && (
                <>
                  <Category title="Text channels" onAdd={isAdmin ? () => setModal({ type: "text" }) : null} />
                  {textChannels.map((c) => (
                    <div key={c.id} className="group flex items-center">
                      <button
                        onClick={() => setChannelId(c.id)}
                        className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded mb-0.5 transition-colors ${c.id === channelId ? "bg-[#404249] text-white" : "text-slate-400 hover:bg-[#35373c] hover:text-slate-200"}`}
                      >
                        <Hash size={18} className="text-slate-500 shrink-0" />
                        <span className="truncate text-sm">{c.name}</span>
                      </button>
                      {isAdmin && (
                        <button onClick={() => deleteChannel(c.id)} title="Delete channel" className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 px-1"><Trash2 size={13} /></button>
                      )}
                    </div>
                  ))}

                  <Category title="Voice channels" onAdd={isAdmin ? () => setModal({ type: "voice" }) : null} />
                  {voiceChannels.map((c) => (
                    <div key={c.id} className="flex items-center gap-1.5 px-2 py-1.5 text-slate-500 text-sm">
                      <Volume2 size={18} className="shrink-0" />
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto text-[10px] uppercase">jald aa raha hai</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {/* User panel */}
        <div className="bg-[#232428] px-2 py-2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {(profile?.username || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate leading-tight">{profile?.display_name || profile?.username}</p>
            <p className="text-[11px] text-slate-400 truncate leading-tight">@{profile?.username}</p>
          </div>
          <button onClick={logout} title="Logout" className="text-slate-400 hover:text-rose-400 p-1.5"><LogOut size={18} /></button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {view === "friends" && (
          <FriendsView
            tab={friendTab}
            setTab={setFriendTab}
            friends={accepted}
            incoming={incoming}
            outgoing={outgoing}
            onAdd={() => setModal("addFriend")}
            onAccept={acceptRequest}
            onRemove={removeFriend}
            onMessage={openDM}
          />
        )}

        {view === "dm" && dmUser && (
          <DMView
            user={dmUser}
            messages={dms}
            me={me}
            nameOf={nameOf}
            draft={dmDraft}
            setDraft={setDmDraft}
            onSend={sendDM}
            endRef={endRef}
          />
        )}

        {view === "server" && (
          <>
            <header className="h-12 px-4 flex items-center gap-2 border-b border-[#26272b] shadow-sm shrink-0">
              <Hash size={22} className="text-slate-500" />
              <h1 className="font-semibold text-white truncate">{channel?.name ?? "Channel select karein"}</h1>
              {channel?.topic && <p className="text-sm text-slate-400 truncate hidden md:block">— {channel.topic}</p>}
            </header>

            {!channel ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                {servers.length === 0 ? "Pehle server banayein ya invite se join karein." : "Koi text channel select karein."}
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto custom-scroll py-4">
                  {messages.length === 0 && (
                    <p className="px-4 text-slate-500 text-sm">#{channel.name} mein abhi koi message nahi. Pehla message bhejein!</p>
                  )}

                  {messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const newGroup = !prev || prev.author_id !== m.author_id || new Date(m.created_at) - new Date(prev.created_at) > 5 * 60e3;
                    const isMine = m.author_id === me;
                    const reactionGroups = m.reactions.reduce((acc, r) => {
                      (acc[r.emoji] ||= []).push(r.user_id);
                      return acc;
                    }, {});

                    return (
                      <div key={m.id} className={`group relative px-4 py-0.5 hover:bg-[#2e3035] ${newGroup ? "mt-3" : ""}`}>
                        <div className="absolute -top-3 right-4 hidden group-hover:flex items-center bg-[#313338] border border-[#26272b] rounded shadow-md">
                          {QUICK.map((e) => (
                            <button key={e} onClick={() => toggleReaction(m, e)} className="w-7 h-7 hover:bg-[#3f4147] rounded text-sm">{e}</button>
                          ))}
                          {isMine && (
                            <button onClick={() => setEditing({ id: m.id, text: m.content })} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#3f4147] rounded"><Pencil size={14} /></button>
                          )}
                          {isMine && (
                            <button onClick={() => deleteMessage(m.id)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-[#3f4147] rounded"><Trash2 size={14} /></button>
                          )}
                        </div>

                        <div className="flex gap-4">
                          {newGroup ? (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">
                              {(m.author?.username || "?").slice(0, 2).toUpperCase()}
                            </div>
                          ) : (
                            <div className="w-10 shrink-0 text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 text-right pt-1">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            {newGroup && (
                              <div className="flex items-baseline gap-2">
                                <span className="font-medium text-violet-300">{nameOf(m.author)}</span>
                                <span className="text-[11px] text-slate-500">{new Date(m.created_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                              </div>
                            )}

                            {editing?.id === m.id ? (
                              <input
                                autoFocus
                                value={editing.text}
                                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }}
                                className="w-full bg-[#383a40] text-slate-100 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-violet-500"
                              />
                            ) : (
                              <p className="text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                                {m.content}
                                {m.edited && <span className="text-[10px] text-slate-500 ml-1">(edited)</span>}
                              </p>
                            )}

                            {Object.keys(reactionGroups).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(reactionGroups).map(([emoji, users]) => (
                                  <button
                                    key={emoji}
                                    onClick={() => toggleReaction(m, emoji)}
                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs ${users.includes(me) ? "bg-violet-500/20 border-violet-500" : "bg-[#2b2d31] border-transparent hover:border-slate-500"}`}
                                  >
                                    {emoji} <span className="text-slate-300">{users.length}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>

                <div className="px-4 pb-6 pt-1 shrink-0">
                  <div className="flex items-end bg-[#383a40] rounded-lg px-4 gap-3 focus-within:ring-1 focus-within:ring-violet-500">
                    <textarea
                      rows={1}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                      maxLength={2000}
                      placeholder={`#${channel.name} mein message likhein`}
                      className="flex-1 bg-transparent py-3 outline-none resize-none text-slate-100 placeholder:text-slate-500 max-h-32"
                    />
                    <button onClick={send} disabled={!draft.trim()} className="py-3 text-violet-400 hover:text-violet-300 disabled:text-slate-600">
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Modals */}
      {modal === "server" && <NameModal title="Server banayein" placeholder="Server ka naam" submitLabel="Create" onClose={() => setModal(null)} onSubmit={createServer} />}
      {modal === "join" && <NameModal title="Server join karein" placeholder="Invite code" submitLabel="Join" onClose={() => setModal(null)} onSubmit={joinServer} />}
      {modal?.type && <NameModal title={`${modal.type === "voice" ? "Voice" : "Text"} channel banayein`} placeholder="channel-ka-naam" submitLabel="Create" onClose={() => setModal(null)} onSubmit={(n) => createChannel(n, modal.type)} />}
      {modal === "addFriend" && <NameModal title="Friend add karein" placeholder="Username (jaise novakai)" submitLabel="Send Request" onClose={() => setModal(null)} onSubmit={sendFriendRequest} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#111214] text-white text-sm px-4 py-2.5 rounded-lg shadow-2xl border border-violet-500/40">
          {toast}
        </div>
      )}
    </div>
  );
}

function Category({ title, onAdd }) {
  return (
    <div className="flex items-center px-1 py-1 mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 group">
      <span>{title}</span>
      {onAdd && (
        <button onClick={onAdd} className="ml-auto opacity-0 group-hover:opacity-100 hover:text-white"><Plus size={14} /></button>
      )}
    </div>
  );
}

function NameModal({ title, placeholder, submitLabel, onClose, onSubmit }) {
  const [value, setValue] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} className="w-full max-w-md bg-[#313338] rounded-lg p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#1e1f22] text-slate-100 rounded px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-500"
        />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-slate-300 hover:underline text-sm px-2">Cancel</button>
          <button type="submit" disabled={!value.trim()} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm px-5 py-2 rounded">{submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

function FriendsView({ tab, setTab, friends, incoming, outgoing, onAdd, onAccept, onRemove, onMessage }) {
  const name = (u) => u?.display_name || u?.username || "Unknown";
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-12 px-4 flex items-center gap-4 border-b border-[#26272b] shrink-0">
        <span className="font-semibold text-white flex items-center gap-2"><Users size={18} /> Friends</span>
        {["online", "all", "pending"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2.5 py-1 rounded text-sm capitalize ${tab === t ? "bg-[#404249] text-white" : "text-slate-400 hover:bg-[#35373c]"}`}
          >
            {t === "pending" ? `Pending (${incoming.length + outgoing.length})` : t}
          </button>
        ))}
        <button onClick={onAdd} className="ml-auto bg-violet-600 hover:bg-violet-500 text-white text-sm px-3 py-1 rounded flex items-center gap-1.5">
          <UserPlus size={15} /> Add Friend
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-1">
        {tab !== "pending" && friends.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#35373c]">
            <div className="w-9 h-9 rounded-full bg-violet-600 text-xs font-bold text-white flex items-center justify-center">
              {(u.username || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{name(u)}</p>
              <p className="text-xs text-slate-400">@{u.username}</p>
            </div>
            <button onClick={() => onMessage(u)} title="Message" className="text-slate-400 hover:text-white p-2"><MessageSquare size={18} /></button>
            <button onClick={() => onRemove(u.id)} title="Remove" className="text-slate-400 hover:text-rose-400 p-2"><X size={18} /></button>
          </div>
        ))}
        {tab === "pending" && (
          <>
            {incoming.map((f) => (
              <div key={f.requester_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#35373c]">
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">{name(f.requester)}</p>
                  <p className="text-xs text-slate-400">Incoming request</p>
                </div>
                <button onClick={() => onAccept(f.requester_id)} title="Accept" className="text-emerald-400 hover:text-emerald-300 p-2"><Check size={18} /></button>
                <button onClick={() => onRemove(f.requester_id)} title="Reject" className="text-rose-400 hover:text-rose-300 p-2"><X size={18} /></button>
              </div>
            ))}
            {outgoing.map((f) => (
              <div key={f.addressee_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#35373c]">
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">{name(f.addressee)}</p>
                  <p className="text-xs text-slate-400">Outgoing request</p>
                </div>
                <button onClick={() => onRemove(f.addressee_id)} title="Cancel" className="text-slate-400 hover:text-rose-400 p-2"><X size={18} /></button>
              </div>
            ))}
            {incoming.length + outgoing.length === 0 && <p className="text-slate-500 text-sm">Koi pending request nahi.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function DMView({ user, messages, me, nameOf, draft, setDraft, onSend, endRef }) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-12 px-4 flex items-center border-b border-[#26272b] shrink-0 font-semibold text-white">@{user.username}</div>
      <div className="flex-1 overflow-y-auto custom-scroll py-4">
        {messages.map((m) => (
          <div key={m.id} className="px-4 py-1 flex gap-3">
            <span className={`font-medium ${m.sender_id === me ? "text-violet-300" : "text-emerald-300"}`}>
              {m.sender_id === me ? "Aap" : nameOf(user)}
            </span>
            <span className="text-slate-200 whitespace-pre-wrap break-words">{m.content}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="px-4 pb-6 pt-1">
        <div className="flex items-end bg-[#383a40] rounded-lg px-4 gap-3 focus-within:ring-1 focus-within:ring-violet-500">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={`@${user.username} ko message`}
            maxLength={2000}
            className="flex-1 bg-transparent py-3 outline-none resize-none text-slate-100 placeholder:text-slate-500"
          />
          <button onClick={onSend} disabled={!draft.trim()} className="py-3 text-violet-400 disabled:text-slate-600"><Send size={20} /></button>
        </div>
      </div>
    </div>
  );
}
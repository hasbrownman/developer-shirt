import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Settings, Trash2, Github, Terminal, MessageSquare, ShieldAlert, Image, Video, Plus, LayoutGrid, LogIn, UserPlus, LogOut, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { chatWithGemini, Message, AggressionLevel } from './services/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { io, Socket } from 'socket.io-client';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [nickname, setNickname] = useState('User');
  const [aggressionLevel, setAggressionLevel] = useState<AggressionLevel>('savage');
  const [location, setLocation] = useState<string | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  const [showHappyJollys, setShowHappyJollys] = useState(false);
  const [showSigeonView, setShowSigeonView] = useState(false);
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'none'>('none');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');

  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [publicMessages, setPublicMessages] = useState<any[]>([]);
  const [privateMessages, setPrivateMessages] = useState<Record<string, any[]>>({});
  const [activePrivateChat, setActivePrivateChat] = useState<any | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [showCommunityChat, setShowCommunityChat] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postMedia, setPostMedia] = useState<{ type: 'image' | 'video', url: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'chat' | 'people'>('feed');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('userList', (users) => setOnlineUsers(users));
    
    newSocket.on('publicMessage', (msg) => {
      setPublicMessages(prev => [...prev, msg]);
    });

    newSocket.on('privateMessage', (msg) => {
      const otherId = msg.to === newSocket.id ? msg.from.id : msg.to;
      setPrivateMessages(prev => ({
        ...prev,
        [otherId]: [...(prev[otherId] || []), msg]
      }));
    });

    newSocket.on('postHistory', (history) => setPosts(history));
    newSocket.on('newPost', (post) => setPosts(prev => [post, ...prev]));
    
    newSocket.on('postDeleted', (postId) => {
      setPosts(prev => prev.filter(post => post.id !== postId));
    });

    newSocket.on('commentDeleted', ({ commentId, postId }) => {
      setPosts(prev => prev.map(post => {
        if (post.id === postId) {
          return { ...post, comments: post.comments.filter((c: any) => c.id !== commentId) };
        }
        return post;
      }));
    });

    newSocket.on('newComment', (comment) => {
      setPosts(prev => prev.map(post => {
        if (post.id === comment.post_id) {
          return { ...post, comments: [...(post.comments || []), comment] };
        }
        return post;
      }));
    });

    newSocket.on('registerSuccess', (data) => {
      alert(data.message);
      setAuthMode('login');
    });

    newSocket.on('loginSuccess', (data) => {
      setCurrentUser(data.user);
      setNickname(data.user.username);
      setAuthMode('none');
      localStorage.setItem('sigeon_token', data.token);
    });

    newSocket.on('authError', (err) => setAuthError(err));

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (socket && showSigeonView && currentUser) {
      socket.emit('join', { id: currentUser.id, name: currentUser.username, color: currentUser.color });
    }
  }, [socket, showSigeonView, currentUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [publicMessages, privateMessages, activePrivateChat]);

  const sendPublicMessage = () => {
    if (!chatInput.trim() || !socket) return;
    socket.emit('publicMessage', { content: chatInput });
    setChatInput('');
  };

  const sendPrivateMessage = () => {
    if (!chatInput.trim() || !socket || !activePrivateChat) return;
    socket.emit('privateMessage', { to: activePrivateChat.id, content: chatInput });
    setChatInput('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      setPostMedia({
        type: file.type.startsWith('video') ? 'video' : 'image',
        url: url
      });
    };
    reader.readAsDataURL(file);
  };

  const createPost = () => {
    if ((!postContent.trim() && !postMedia) || !socket || !currentUser) return;
    socket.emit('createPost', { userId: currentUser.id, content: postContent, media: postMedia });
    setPostContent('');
    setPostMedia(null);
    setShowPostModal(false);
  };

  const createComment = (postId: string) => {
    const content = commentInputs[postId];
    if (!content?.trim() || !socket || !currentUser) return;
    socket.emit('createComment', { postId, userId: currentUser.id, content });
    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
  };

  const deletePost = (postId: string) => {
    if (!socket || !currentUser) return;
    if (confirm('Are you sure you want to delete this broadcast?')) {
      socket.emit('deletePost', { postId, userId: currentUser.id });
    }
  };

  const deleteComment = (commentId: string) => {
    if (!socket || !currentUser) return;
    socket.emit('deleteComment', { commentId, userId: currentUser.id });
  };

  const handleAuth = () => {
    if (!authForm.username || !authForm.password || !socket) return;
    if (authMode === 'register') {
      socket.emit('register', { ...authForm, color: '#4A6D55' });
    } else {
      socket.emit('login', authForm);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (aggressionLevel === 'savage' && !location) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        },
        (err) => console.warn('Location access denied. Sigeontaj is disappointed.'),
        { enableHighAccuracy: true }
      );
    }
  }, [aggressionLevel]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chatWithGemini(newMessages, nickname, aggressionLevel, location);
      setMessages([...newMessages, { 
        role: 'model', 
        content: response || "I've got nothing to say to that."
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages([...newMessages, { role: 'model', content: "Something went wrong. Even I have limits, apparently." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    if (confirm('Wipe the history?')) {
      setMessages([]);
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        className="w-80 border-r-2 border-[#2C2E31] bg-[#2C2E31] p-6 flex flex-col gap-8 hidden md:flex"
      >
        <div className="flex items-center gap-3">
          <Terminal className="text-[#6C4675]" size={32} />
          <h1 className="font-display text-2xl tracking-tighter uppercase italic">
            Sigeontaj<span className="text-[#4A6D55]">Minorholta</span>
          </h1>
        </div>

        <div className="flex flex-col gap-4">
          <label className="text-xs uppercase font-bold tracking-widest text-zinc-500">Identity</label>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-mono">Current Nickname:</span>
            <input 
              type="text" 
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="bg-zinc-900 brutal-border p-2 font-mono text-[#00FF00] outline-none focus:border-[#00FF00]"
              placeholder="Who are you?"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <label className="text-xs uppercase font-bold tracking-widest text-zinc-500">Aggression Level</label>
          <div className="flex flex-col gap-2">
            {(['polite', 'edgy', 'savage'] as AggressionLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setAggressionLevel(level)}
                className={cn(
                  "brutal-btn text-xs uppercase text-left",
                  aggressionLevel === level ? "bg-[#6C4675] border-[#6C4675] text-white" : "bg-[#7A7F85] border-[#2C2E31] text-white"
                )}
              >
                {level === 'polite' ? 'Baby (A+ Work)' : level === 'edgy' ? 'Mild (Attitude)' : 'Savage (Roaster)'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <label className="text-xs uppercase font-bold tracking-widest text-zinc-500">The Happy Jollys</label>
          <button
            onClick={() => setShowHappyJollys(true)}
            className="brutal-btn text-xs uppercase flex items-center justify-between bg-[#D68A8A] border-[#2C2E31] text-white"
          >
            <span>VIEW PHOTOS</span>
            <Bot size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <label className="text-xs uppercase font-bold tracking-widest text-zinc-500">Community</label>
          <button
            onClick={() => setShowSigeonView(true)}
            className="brutal-btn text-xs uppercase flex items-center justify-between bg-[#4A6D55] border-[#2C2E31] text-white"
          >
            <span>SIGEONVIEW</span>
            <LayoutGrid size={14} />
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-4">
          <button 
            onClick={clearChat}
            className="brutal-btn flex items-center justify-center gap-2 w-full"
          >
            <Trash2 size={18} /> WIPE HISTORY
          </button>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-600 font-bold">
            <span>v1.0.0-UNFILTERED</span>
            <span>EST. 2026</span>
          </div>
        </div>
      </motion.aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative">
        {/* Header (Mobile) */}
        <header className="md:hidden border-bottom-2 border-white p-4 flex justify-between items-center bg-black">
          <h1 className="font-display text-xl">Sigeontaj</h1>
          <button onClick={() => setShowSettings(!showSettings)} className="brutal-btn p-1">
            <Settings size={20} />
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-6 opacity-50">
              <div className="w-32 h-32 brutal-border-neon overflow-hidden bg-[#4A6D55]">
                <img 
                  src="https://images.squarespace-cdn.com/content/v1/5a0d99909f8dce669960572c/1560444342410-O7Z9XQ9X9X9X9X9X9X9X/pigeon.jpg" 
                  alt="Sigeontaj"
                  className="w-full h-full object-cover grayscale contrast-125"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="max-w-md">
                <h2 className="font-display text-4xl uppercase mb-2">Sigeontaj is watching</h2>
                <p className="font-mono text-sm">
                  I'm a pigeon with a human head and a mouth that will ruin your day, {nickname}. Say something so I can destroy you.
                </p>
              </div>
            </div>
          )}
          
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-4 max-w-3xl",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "w-12 h-12 shrink-0 flex items-center justify-center brutal-border overflow-hidden",
                  msg.role === 'user' ? "bg-[#F5F5F5] text-[#2C2E31]" : "bg-[#4A6D55] border-[#4A6D55]"
                )}>
                  {msg.role === 'user' ? (
                    <User size={24} />
                  ) : (
                    <img 
                      src="https://images.squarespace-cdn.com/content/v1/5a0d99909f8dce669960572c/1560444342410-O7Z9XQ9X9X9X9X9X9X9X/pigeon.jpg" 
                      alt="Sigeontaj"
                      className="w-full h-full object-cover grayscale"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
                <div className={cn(
                  "p-4 brutal-border min-w-[100px]",
                  msg.role === 'user' ? "bg-[#2C2E31] border-[#F5F5F5]" : "bg-[#2C2E31] border-[#6C4675]"
                )}>
                  <div className="prose prose-invert max-w-none font-mono text-sm leading-relaxed">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <div className="flex gap-4 mr-auto animate-pulse">
              <div className="w-10 h-10 brutal-border bg-[#4A6D55] flex items-center justify-center">
                <Bot size={20} className="text-white" />
              </div>
              <div className="p-4 brutal-border bg-[#2C2E31] border-[#4A6D55]">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#4A6D55] rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-[#4A6D55] rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-[#4A6D55] rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-8 bg-[#7A7F85]">
          <div className="max-w-4xl mx-auto relative">
            <div className="flex gap-4">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Tell me something, ${nickname}...`}
                className="flex-1 bg-[#2C2E31] brutal-border p-4 font-mono text-white outline-none focus:border-[#6C4675] resize-none h-16 md:h-24"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="brutal-btn-neon flex items-center justify-center px-8 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={24} />
              </button>
            </div>
            <div className="mt-2 flex justify-between items-center px-1">
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                System Status: NOMINAL
              </span>
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                Press Enter to Send
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Settings Overlay */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/90 md:hidden p-8 flex flex-col gap-8"
            >
              <div className="flex justify-between items-center">
                <h2 className="font-display text-3xl">SETTINGS</h2>
                <button onClick={() => setShowSettings(false)} className="brutal-btn">CLOSE</button>
              </div>
              <div className="flex flex-col gap-4">
                <label className="text-xs uppercase font-bold tracking-widest text-zinc-500">Identity</label>
                <input 
                  type="text" 
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="bg-zinc-900 brutal-border p-4 font-mono text-[#00FF00] outline-none"
                  placeholder="Who are you?"
                />
              </div>

              <div className="flex flex-col gap-4">
                <label className="text-xs uppercase font-bold tracking-widest text-zinc-500">Aggression Level</label>
                <div className="grid grid-cols-1 gap-2">
                  {(['polite', 'edgy', 'savage'] as AggressionLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setAggressionLevel(level)}
                      className={cn(
                        "brutal-btn text-sm uppercase",
                        aggressionLevel === level ? "bg-[#6C4675] border-[#6C4675] text-white" : "bg-[#7A7F85] border-[#2C2E31] text-white"
                      )}
                    >
                      {level === 'polite' ? 'Baby' : level === 'edgy' ? 'Mild' : 'Savage'}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => { clearChat(); setShowSettings(false); }}
                className="brutal-btn flex items-center justify-center gap-2 w-full mt-auto"
              >
                <Trash2 size={18} /> WIPE HISTORY
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Background Grid Decoration */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-[-1]" 
           style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* The Happy Jollys Modal */}
      <AnimatePresence>
        {showHappyJollys && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 md:p-8"
          >
            <div className="w-full max-w-4xl bg-[#7A7F85] brutal-border p-6 flex flex-col gap-6 max-h-[90vh] overflow-hidden">
              <div className="flex justify-between items-center border-b-2 border-[#2C2E31] pb-4">
                <h2 className="font-display text-3xl uppercase tracking-tighter">The Happy Jollys</h2>
                <button 
                  onClick={() => setShowHappyJollys(false)}
                  className="brutal-btn bg-[#6C4675] text-white"
                >
                  CLOSE
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
                {[
                  "https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&q=80&w=600&h=600",
                  "https://images.unsplash.com/photo-1509249023963-7067980a3739?auto=format&fit=crop&q=80&w=600&h=600",
                  "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&q=80&w=600&h=600",
                  "https://images.unsplash.com/photo-1531948371545-9854e93da3e1?auto=format&fit=crop&q=80&w=600&h=600",
                  "https://images.unsplash.com/photo-1551232864-3f0890e580d9?auto=format&fit=crop&q=80&w=600&h=600",
                  "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&q=80&w=600&h=600",
                  "https://images.unsplash.com/photo-1505635330303-d3f146aa1a60?auto=format&fit=crop&q=80&w=600&h=600",
                  "https://images.unsplash.com/photo-1501436513145-30f24e19fcc8?auto=format&fit=crop&q=80&w=600&h=600",
                  "https://images.unsplash.com/photo-1510133769068-65624ba8ee17?auto=format&fit=crop&q=80&w=600&h=600",
                  "https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&q=80&w=600&h=600"
                ].map((url, i) => (
                  <div key={i} className="brutal-border overflow-hidden bg-[#3D2B1F] aspect-square relative group">
                    <img 
                      src={url} 
                      alt="Creepy Happy Jolly"
                      className="w-full h-full object-cover grayscale sepia contrast-150 brightness-50 group-hover:brightness-100 transition-all duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-center p-4">
                      <span className="font-display text-xl text-white uppercase tracking-widest">CREEPY JOLLY #{i + 1}</span>
                    </div>
                  </div>
                ))}
                
                <div className="col-span-full py-8 flex justify-center">
                  <button 
                    className="font-display text-2xl uppercase tracking-tighter hover:text-[#D68A8A] transition-colors flex items-center gap-2"
                    onClick={() => {
                      const chat = document.querySelector('.custom-scrollbar');
                      if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
                    }}
                  >
                    SHOW MORE <span className="text-sm">↓</span>
                  </button>
                </div>
              </div>
              
              <p className="font-mono text-xs text-center text-zinc-400 uppercase tracking-widest">
                Warning: These jollys are extremely happy.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* SigeonView Modal */}
      <AnimatePresence>
        {showSigeonView && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 md:p-8"
          >
            <div className="w-full max-w-5xl h-[90vh] bg-[#2C2E31] brutal-border flex flex-col overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b-2 border-zinc-700 flex justify-between items-center bg-[#1a1a1a]">
                <div className="flex items-center gap-6">
                  <h2 className="font-display text-4xl uppercase tracking-tighter text-[#00FF00]">SIGEONVIEW</h2>
                  {currentUser ? (
                    <div className="flex gap-2">
                      {(['feed', 'chat', 'people'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => {
                            setActiveTab(tab);
                            setActivePrivateChat(null);
                            setShowCommunityChat(tab === 'chat');
                          }}
                          className={cn(
                            "px-4 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border transition-all",
                            activeTab === tab ? "bg-[#00FF00] text-black" : "bg-zinc-800 text-zinc-400 hover:text-white"
                          )}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { setAuthMode('login'); setAuthError(''); }}
                        className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border bg-zinc-800 text-white hover:bg-[#00FF00] hover:text-black transition-all"
                      >
                        LOGIN
                      </button>
                      <button 
                        onClick={() => { setAuthMode('register'); setAuthError(''); }}
                        className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border bg-zinc-800 text-white hover:bg-[#00FF00] hover:text-black transition-all"
                      >
                        REGISTER
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {currentUser && (
                    <div className="flex items-center gap-2 pr-4 border-r border-zinc-800">
                      <div className="w-6 h-6 brutal-border" style={{ backgroundColor: currentUser.color }} />
                      <span className="font-mono text-[10px] text-zinc-400 uppercase">{currentUser.username}</span>
                      <button onClick={() => setCurrentUser(null)} className="text-zinc-600 hover:text-red-500">
                        <LogOut size={14} />
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={() => {
                      setShowSigeonView(false);
                      setActivePrivateChat(null);
                      setShowCommunityChat(false);
                    }}
                    className="brutal-btn bg-zinc-800 text-white px-6"
                  >
                    EXIT
                  </button>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {!currentUser ? (
                  <div className="flex-1 flex items-center justify-center bg-black/40">
                    <div className="text-center max-w-md w-full p-8 brutal-border bg-[#1a1a1a]">
                      <ShieldAlert size={48} className="mx-auto mb-4 text-[#00FF00]" />
                      <h3 className="font-display text-2xl uppercase tracking-tighter mb-2">Authentication Required</h3>
                      <p className="font-mono text-xs text-zinc-500 mb-8 uppercase">You must be logged in to access the SigeonView network.</p>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => setAuthMode('login')}
                          className="flex-1 brutal-btn bg-[#00FF00] text-black font-bold py-3"
                        >
                          LOGIN
                        </button>
                        <button 
                          onClick={() => setAuthMode('register')}
                          className="flex-1 brutal-btn bg-zinc-800 text-white py-3"
                        >
                          REGISTER
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Left Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                      {activeTab === 'feed' && (
                        <div className="max-w-2xl mx-auto flex flex-col gap-8">
                          {/* Create Post Trigger */}
                          <button 
                            onClick={() => setShowPostModal(true)}
                            className="w-full p-6 bg-black/40 brutal-border border-zinc-700 flex items-center gap-4 hover:border-[#00FF00] transition-all group"
                          >
                            <div className="w-12 h-12 brutal-border flex items-center justify-center bg-zinc-800 group-hover:bg-[#00FF00] transition-colors">
                              <Plus className="group-hover:text-black" />
                            </div>
                            <span className="font-mono text-zinc-500 uppercase tracking-widest">Share your vision, {currentUser.username}...</span>
                          </button>

                          {/* Posts List */}
                          <div className="flex flex-col gap-12">
                            {posts.map((post) => (
                              <motion.article 
                                key={post.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col gap-4 bg-black/20 p-6 brutal-border border-zinc-800"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 brutal-border flex items-center justify-center" style={{ backgroundColor: post.color }}>
                                      <User size={20} className="text-white" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-display text-lg leading-none">{post.username}</span>
                                      <span className="text-[10px] font-mono text-zinc-600 uppercase">{new Date(post.created_at).toLocaleString()}</span>
                                    </div>
                                  </div>
                                  {currentUser.id === post.user_id && (
                                    <button 
                                      onClick={() => deletePost(post.id)}
                                      className="text-zinc-700 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </div>
                                
                                {post.content && (
                                  <p className="font-mono text-sm leading-relaxed text-zinc-300">{post.content}</p>
                                )}

                                {post.media_url && (
                                  <div className="brutal-border border-zinc-700 overflow-hidden bg-black aspect-video flex items-center justify-center">
                                    {post.media_type === 'image' ? (
                                      <img src={post.media_url} alt="Post content" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                    ) : (
                                      <video src={post.media_url} controls className="w-full h-full object-contain" />
                                    )}
                                  </div>
                                )}

                                {/* Comments Section */}
                                <div className="mt-4 pt-4 border-t border-zinc-800">
                                  <div className="flex flex-col gap-4 mb-4">
                                    {post.comments?.map((comment: any) => (
                                      <div key={comment.id} className="flex gap-3 bg-black/40 p-3 brutal-border border-zinc-800">
                                        <div className="w-6 h-6 brutal-border flex-shrink-0" style={{ backgroundColor: comment.color }} />
                                        <div className="flex flex-col gap-1">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-[#00FF00] uppercase">{comment.username}</span>
                                            <span className="text-[8px] font-mono text-zinc-600">{new Date(comment.created_at).toLocaleTimeString()}</span>
                                            {currentUser.id === comment.user_id && (
                                              <button 
                                                onClick={() => deleteComment(comment.id)}
                                                className="text-zinc-700 hover:text-red-500 ml-auto"
                                              >
                                                <Trash2 size={10} />
                                              </button>
                                            )}
                                          </div>
                                          <p className="text-xs font-mono text-zinc-300">{comment.content}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  
                                  <div className="flex gap-2">
                                    <input 
                                      type="text"
                                      value={commentInputs[post.id] || ''}
                                      onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                                      onKeyDown={(e) => e.key === 'Enter' && createComment(post.id)}
                                      placeholder="Add a comment..."
                                      className="flex-1 bg-black brutal-border p-2 font-mono text-xs text-white outline-none border-zinc-800 focus:border-[#00FF00]"
                                    />
                                    <button 
                                      onClick={() => createComment(post.id)}
                                      className="brutal-btn bg-zinc-800 text-white px-3"
                                    >
                                      <MessageCircle size={14} />
                                    </button>
                                  </div>
                                </div>
                              </motion.article>
                            ))}
                            {posts.length === 0 && (
                              <div className="py-20 text-center opacity-20">
                                <LayoutGrid size={64} className="mx-auto mb-4" />
                                <p className="font-mono text-sm uppercase tracking-widest">The feed is empty. Be the first to post.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {activeTab === 'chat' && (
                        <div className="h-full flex flex-col">
                          {!activePrivateChat && !showCommunityChat ? (
                            <div className="flex flex-col gap-4">
                              <button 
                                onClick={() => setShowCommunityChat(true)}
                                className="flex items-center justify-between p-4 bg-[#4A6D55]/20 brutal-border border-[#4A6D55] hover:bg-[#4A6D55]/40 transition-colors"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 brutal-border flex items-center justify-center bg-[#4A6D55]">
                                    <MessageSquare size={20} className="text-white" />
                                  </div>
                                  <div className="flex flex-col text-left">
                                    <span className="font-display text-lg tracking-tight">COMMUNITY CHAT</span>
                                    <span className="text-[10px] font-mono text-[#00FF00] uppercase">PUBLIC CHANNEL (UNCENSORED)</span>
                                  </div>
                                </div>
                                <div className="w-2 h-2 rounded-full bg-[#00FF00] animate-pulse" />
                              </button>
                              <div className="h-px bg-zinc-800 my-2" />
                              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Select a pigeon to message privately</p>
                              {onlineUsers.filter(u => u.id !== socket?.id).map((person, i) => (
                                <button 
                                  key={i}
                                  onClick={() => setActivePrivateChat(person)}
                                  className="flex items-center justify-between p-4 bg-black/40 brutal-border border-zinc-800 hover:border-zinc-600 transition-colors group text-left"
                                >
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 brutal-border flex items-center justify-center" style={{ backgroundColor: person.color }}>
                                      <User size={20} className="text-white" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-display text-lg tracking-tight">{person.name}</span>
                                      <span className="text-[10px] font-mono text-zinc-500 uppercase">{person.status}</span>
                                    </div>
                                  </div>
                                  <MessageSquare size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-col h-full">
                              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4 mb-4">
                                {(activePrivateChat ? (privateMessages[activePrivateChat.id] || []) : publicMessages).map((msg, i) => (
                                  <div key={i} className={cn(
                                    "flex flex-col gap-1",
                                    msg.from.id === socket?.id ? "items-end" : "items-start"
                                  )}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-bold uppercase text-zinc-500">{msg.from.name}</span>
                                      <span className="text-[8px] font-mono text-zinc-700">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <div className={cn(
                                      "p-3 brutal-border max-w-[80%] break-words",
                                      msg.from.id === socket?.id ? "bg-[#4A6D55] border-[#4A6D55] text-white" : "bg-black/60 border-zinc-700 text-zinc-200"
                                    )}>
                                      <p className="font-mono text-sm">{msg.content}</p>
                                    </div>
                                  </div>
                                ))}
                                <div ref={chatEndRef} />
                              </div>
                              <div className="flex gap-2">
                                <input 
                                  type="text"
                                  value={chatInput}
                                  onChange={(e) => setChatInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      activePrivateChat ? sendPrivateMessage() : sendPublicMessage();
                                    }
                                  }}
                                  placeholder={activePrivateChat ? `Message ${activePrivateChat.name}...` : "Broadcast to community..."}
                                  className="flex-1 bg-black brutal-border p-3 font-mono text-sm text-[#00FF00] outline-none border-zinc-700 focus:border-[#4A6D55]"
                                />
                                <button 
                                  onClick={activePrivateChat ? sendPrivateMessage : sendPublicMessage}
                                  className="brutal-btn bg-[#4A6D55] text-white px-6"
                                >
                                  <Send size={18} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === 'people' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {onlineUsers.map((person, i) => (
                            <div key={i} className="p-4 bg-black/40 brutal-border border-zinc-800 flex items-center gap-4">
                              <div className="w-12 h-12 brutal-border flex items-center justify-center" style={{ backgroundColor: person.color }}>
                                <User size={24} className="text-white" />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-display text-xl tracking-tighter">{person.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "w-2 h-2 rounded-full",
                                    person.id === socket?.id ? "bg-[#00FF00]" : "bg-zinc-500"
                                  )} />
                                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                                    {person.id === socket?.id ? 'YOU' : person.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right Sidebar (Stats/Info) */}
                    <div className="w-72 border-l-2 border-zinc-700 p-6 bg-[#1a1a1a] hidden lg:flex flex-col gap-8">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">Network Status</label>
                        <div className="p-4 bg-black brutal-border border-zinc-800">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-mono text-zinc-400">Online Pigeons</span>
                            <span className="text-xs font-mono text-[#00FF00]">{onlineUsers.length}</span>
                          </div>
                          <div className="w-full h-1 bg-zinc-800">
                            <div className="h-full bg-[#00FF00]" style={{ width: `${(onlineUsers.length / 100) * 100}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-4">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">System Logs</label>
                        <div className="flex flex-col gap-2 font-mono text-[9px] text-zinc-500">
                          <p>{'>'} SIGEONVIEW_INIT_SUCCESS</p>
                          <p>{'>'} ENCRYPTION_LAYER_ACTIVE</p>
                          <p>{'>'} BROADCAST_NODE_STABLE</p>
                          <p>{'>'} USER_{currentUser.username.toUpperCase()}_CONNECTED</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {authMode !== 'none' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md bg-[#2C2E31] brutal-border p-8 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h2 className="font-display text-3xl uppercase tracking-tighter text-[#00FF00]">
                  {authMode === 'login' ? 'LOGIN' : 'REGISTER'}
                </h2>
                <button onClick={() => setAuthMode('none')} className="text-zinc-500 hover:text-white">CLOSE</button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Username</label>
                  <input 
                    type="text"
                    value={authForm.username}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, username: e.target.value }))}
                    className="bg-black brutal-border p-3 font-mono text-white outline-none border-zinc-700 focus:border-[#00FF00]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Password</label>
                  <input 
                    type="password"
                    value={authForm.password}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                    className="bg-black brutal-border p-3 font-mono text-white outline-none border-zinc-700 focus:border-[#00FF00]"
                  />
                </div>
                {authError && <p className="text-[10px] text-red-500 font-bold uppercase">{authError}</p>}
              </div>

              <button 
                onClick={handleAuth}
                className="brutal-btn bg-[#00FF00] text-black font-bold py-4"
              >
                {authMode === 'login' ? <LogIn className="inline mr-2" /> : <UserPlus className="inline mr-2" />}
                {authMode === 'login' ? 'AUTHENTICATE' : 'CREATE ACCOUNT'}
              </button>

              <p className="text-center font-mono text-[10px] text-zinc-500 uppercase">
                {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}
                <button 
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="ml-2 text-[#00FF00] underline"
                >
                  {authMode === 'login' ? 'REGISTER' : 'LOGIN'}
                </button>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Post Modal */}
      <AnimatePresence>
        {showPostModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-xl bg-[#2C2E31] brutal-border p-8 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h2 className="font-display text-3xl uppercase tracking-tighter text-[#00FF00]">NEW BROADCAST</h2>
                <button onClick={() => setShowPostModal(false)} className="text-zinc-500 hover:text-white">CLOSE</button>
              </div>

              <textarea 
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="What's the word on the street?"
                className="w-full h-32 bg-black brutal-border p-4 font-mono text-white outline-none border-zinc-700 focus:border-[#00FF00] resize-none"
              />

              {postMedia && (
                <div className="relative brutal-border border-zinc-700 aspect-video bg-black overflow-hidden">
                  {postMedia.type === 'image' ? (
                    <img src={postMedia.url} alt="Preview" className="w-full h-full object-contain" />
                  ) : (
                    <video src={postMedia.url} className="w-full h-full object-contain" />
                  )}
                  <button 
                    onClick={() => setPostMedia(null)}
                    className="absolute top-2 right-2 bg-red-600 text-white p-1 brutal-border"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}

              <div className="flex gap-4">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*,video/*"
                  className="hidden"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 brutal-btn bg-zinc-800 text-white flex items-center justify-center gap-2"
                >
                  <Image size={20} /> PHOTO / <Video size={20} /> VIDEO
                </button>
                <button 
                  onClick={createPost}
                  disabled={!postContent.trim() && !postMedia}
                  className="flex-1 brutal-btn bg-[#00FF00] text-black font-bold disabled:opacity-50"
                >
                  TRANSMIT
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

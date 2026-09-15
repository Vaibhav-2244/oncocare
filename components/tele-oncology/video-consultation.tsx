'use client';

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoConsultationProps {
  appointment: {
    doctor_id?: string | null;
    reason?: string;
  };
  onClose: () => void;
}

export function VideoConsultation({ appointment, onClose }: VideoConsultationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    { sender: "Doctor", text: "Hello! How are you feeling today?" },
    { sender: "You", text: "Hello doctor." },
  ]);
  const [permissionError, setPermissionError] = useState("");

  const doctorName = appointment.doctor_id || "Doctor";

  useEffect(() => {
    let mounted = true;

    const startMedia = async () => {
      try {
        setPermissionError("");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error: any) {
        console.error("Camera/Microphone error:", error);
        if (error.name === "NotAllowedError") {
          setPermissionError("Camera and microphone permission was denied. Please allow access in your browser.");
        } else if (error.name === "NotFoundError") {
          setPermissionError("No camera or microphone was found on this device.");
        } else {
          setPermissionError("Unable to access your camera or microphone.");
        }
      }
    };

    startMedia();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const toggleMicrophone = () => {
    if (!streamRef.current) return;
    const audioTracks = streamRef.current.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = muted;
    });
    setMuted(!muted);
  };

  const toggleCamera = () => {
    if (!streamRef.current) return;
    const videoTracks = streamRef.current.getVideoTracks();
    videoTracks.forEach((track) => {
      track.enabled = cameraOff;
    });
    setCameraOff(!cameraOff);
  };

  const sendMessage = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { sender: "You", text: trimmed }]);
    setMessage("");
  };

  const handleEndConsultation = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    onClose();
  };

  const doctorInitials = doctorName
    .replace("Dr. ", "")
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-white">
      {/* Top Bar */}
      <div className="flex h-16 items-center justify-between bg-slate-800 px-6 shadow-md">
        <div>
          <h1 className="text-lg font-bold">Video Consultation</h1>
          <p className="text-sm text-slate-400">{doctorName}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-slate-700/50 px-3 py-1 text-sm font-semibold text-emerald-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
          Consultation in progress
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video Area */}
        <div className="relative flex flex-1 flex-col items-center justify-center p-4">
          
          {/* Doctor Video (Mock) */}
          <div className="relative flex h-full w-full max-w-4xl flex-col items-center justify-center overflow-hidden rounded-2xl bg-slate-800">
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-slate-700 text-4xl font-bold text-slate-300">
              {doctorInitials}
            </div>
            <div className="mt-4 text-xl font-semibold">{doctorName}</div>
            <div className="text-slate-400">Oncologist</div>
            
            <div className="absolute bottom-4 left-4 rounded bg-black/50 px-3 py-1 text-sm backdrop-blur-sm">
              {doctorName}
            </div>
          </div>

          {/* Patient Video (Self) */}
          <div className="absolute bottom-8 right-8 h-48 w-36 overflow-hidden rounded-xl border-2 border-slate-700 bg-slate-800 shadow-xl sm:h-64 sm:w-48">
            {cameraOff ? (
              <div className="flex h-full flex-col items-center justify-center bg-slate-800 text-slate-400">
                <VideoOff size={32} className="mb-2" />
                <span className="text-xs">Camera is off</span>
              </div>
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            )}
            <div className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
              You {muted && "(Muted)"}
            </div>
          </div>

          {permissionError && (
            <div className="absolute top-8 rounded-lg bg-rose-500/90 px-4 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
              {permissionError}
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-slate-800/90 p-3 backdrop-blur-md">
            <button
              onClick={toggleMicrophone}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                muted ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-slate-700 text-slate-200 hover:bg-slate-600"
              }`}
            >
              {muted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <button
              onClick={toggleCamera}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                cameraOff ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-slate-700 text-slate-200 hover:bg-slate-600"
              }`}
            >
              {cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>

            <button
              onClick={() => setChatOpen(!chatOpen)}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                chatOpen ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-slate-700 text-slate-200 hover:bg-slate-600"
              }`}
            >
              <MessageCircle size={20} />
            </button>

            <button
              onClick={handleEndConsultation}
              className="flex h-12 items-center gap-2 rounded-full bg-rose-600 px-6 font-semibold text-white transition-colors hover:bg-rose-700"
            >
              <PhoneOff size={20} />
              <span className="hidden sm:inline">End Consultation</span>
            </button>
          </div>
        </div>

        {/* Chat Sidebar */}
        {chatOpen && (
          <div className="flex w-80 flex-col border-l border-slate-700 bg-slate-800">
            <div className="border-b border-slate-700 p-4">
              <h3 className="font-bold">Consultation Chat</h3>
              <p className="text-xs text-slate-400">With {doctorName}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((item, index) => (
                <div key={index} className={`flex flex-col ${item.sender === "You" ? "items-end" : "items-start"}`}>
                  <span className="mb-1 text-[10px] text-slate-400">{item.sender}</span>
                  <div
                    className={`rounded-2xl px-4 py-2 text-sm ${
                      item.sender === "You" ? "bg-teal-600 text-white" : "bg-slate-700 text-slate-200"
                    }`}
                  >
                    {item.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-700 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <Button onClick={sendMessage} className="bg-teal-600 hover:bg-teal-700 text-white">Send</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

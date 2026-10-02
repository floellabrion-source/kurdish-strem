import os
import sys
import time
import subprocess
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# Check FFmpeg
def get_video_info(video_path):
    try:
        cmd = [
            "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
            "format=duration:stream=height", "-of", "default=noprint_wrappers=1",
            video_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        dur = 0.0
        height = 720
        for line in res.stdout.splitlines():
            line = line.strip()
            if line.startswith("duration="):
                try:
                    dur = float(line.split("=")[1])
                except:
                    pass
            elif line.startswith("height="):
                try:
                    height = int(line.split("=")[1])
                except:
                    pass
        return dur, height
    except Exception as e:
        return 0.0, 720

class HLSConverterApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Kurdish Stream - Smart HLS GPU Video Converter (NVIDIA RTX Turbo)")
        self.geometry("760x720")
        self.minsize(700, 650)
        self.configure(bg="#0e0e17")

        self.proc = None
        self.is_running = False
        self.stop_requested = False

        self.setup_ui()

    def setup_ui(self):
        # Header
        header_frame = tk.Frame(self, bg="#0e0e17")
        header_frame.pack(fill="x", padx=20, pady=(15, 5))

        title_lbl = tk.Label(
            header_frame, text="Kurdish Stream - Smart HLS Video Converter",
            font=("Segoe UI", 15, "bold"), fg="#c084fc", bg="#0e0e17"
        )
        title_lbl.pack(anchor="w")

        sub_lbl = tk.Label(
            header_frame, text="Hardware: NVIDIA RTX 4060 Ti GPU Turbo | High-Speed Multi-Quality",
            font=("Segoe UI", 9), fg="#34d399", bg="#0e0e17"
        )
        sub_lbl.pack(anchor="w")

        # File Selection Frame
        file_frame = tk.Frame(self, bg="#161626", padx=12, pady=12, relief="flat", highlightbackground="#2d2d48", highlightthickness=1)
        file_frame.pack(fill="x", padx=20, pady=10)

        self.file_entry = tk.Entry(file_frame, font=("Segoe UI", 10), bg="#222238", fg="#ffffff", insertbackground="white", relief="flat")
        self.file_entry.pack(side="left", fill="x", expand=True, padx=(0, 10), ipady=4)

        browse_btn = tk.Button(
            file_frame, text="Browse Video... 📂", font=("Segoe UI", 9, "bold"),
            bg="#2563eb", fg="#ffffff", activebackground="#3b82f6", activeforeground="#ffffff",
            relief="flat", cursor="hand2", padx=14, pady=3, command=self.browse_file
        )
        browse_btn.pack(side="right")

        # Quality Selection Box
        q_frame = tk.LabelFrame(
            self, text=" Select Output Qualities ", font=("Segoe UI", 9, "bold"),
            fg="#e2e8f0", bg="#161626", padx=15, pady=8, relief="flat", highlightbackground="#2d2d48", highlightthickness=1
        )
        q_frame.pack(fill="x", padx=20, pady=5)

        self.var_1080 = tk.BooleanVar(value=False)
        self.var_720 = tk.BooleanVar(value=True)
        self.var_480 = tk.BooleanVar(value=False)
        self.var_360 = tk.BooleanVar(value=True)

        cb1080 = tk.Checkbutton(q_frame, text="1080p (FHD)", variable=self.var_1080, font=("Segoe UI", 9, "bold"), fg="#38bdf8", bg="#161626", selectcolor="#222238", activebackground="#161626")
        cb1080.pack(side="left", padx=10)

        cb720 = tk.Checkbutton(q_frame, text="720p (HD)", variable=self.var_720, font=("Segoe UI", 9, "bold"), fg="#4ade80", bg="#161626", selectcolor="#222238", activebackground="#161626")
        cb720.pack(side="left", padx=10)

        cb480 = tk.Checkbutton(q_frame, text="480p (SD)", variable=self.var_480, font=("Segoe UI", 9, "bold"), fg="#facc15", bg="#161626", selectcolor="#222238", activebackground="#161626")
        cb480.pack(side="left", padx=10)

        cb360 = tk.Checkbutton(q_frame, text="360p (Data Saver)", variable=self.var_360, font=("Segoe UI", 9, "bold"), fg="#f472b6", bg="#161626", selectcolor="#222238", activebackground="#161626")
        cb360.pack(side="left", padx=10)

        toggle_btn = tk.Button(
            q_frame, text="Toggle All", font=("Segoe UI", 8, "bold"),
            bg="#374151", fg="#ffffff", relief="flat", cursor="hand2", padx=8, pady=1, command=self.toggle_all_qualities
        )
        toggle_btn.pack(side="right", padx=5)

        # Buttons Frame (Convert & Stop)
        btn_frame = tk.Frame(self, bg="#0e0e17")
        btn_frame.pack(fill="x", padx=20, pady=12)

        self.start_btn = tk.Button(
            btn_frame, text="START SMART GPU CONVERSION ▶", font=("Segoe UI", 11, "bold"),
            bg="#059669", fg="#ffffff", activebackground="#10b981", activeforeground="#ffffff",
            relief="flat", cursor="hand2", pady=8, command=self.start_conversion
        )
        self.start_btn.pack(side="left", fill="x", expand=True, padx=(0, 10))

        self.stop_btn = tk.Button(
            btn_frame, text="STOP (ڕاگرتن) ⏹", font=("Segoe UI", 10, "bold"),
            bg="#475569", fg="#ffffff", activebackground="#ef4444", activeforeground="#ffffff",
            relief="flat", state="disabled", cursor="hand2", padx=20, pady=8, command=self.stop_conversion
        )
        self.stop_btn.pack(side="right")

        # Progress Bar & Status
        prog_frame = tk.Frame(self, bg="#0e0e17")
        prog_frame.pack(fill="x", padx=20, pady=(0, 5))

        style = ttk.Style()
        style.theme_use("default")
        style.configure(
            "Custom.Horizontal.TProgressbar",
            troughcolor="#1e1e32",
            background="#22d3ee",
            bordercolor="#0e0e17",
            lightcolor="#22d3ee",
            darkcolor="#0891b2"
        )

        self.progress = ttk.Progressbar(prog_frame, style="Custom.Horizontal.TProgressbar", mode="determinate", length=100)
        self.progress.pack(fill="x", ipady=3)

        self.status_lbl = tk.Label(
            self, text="Status: Idle | ئامادەیە بۆ دەستپێکردن",
            font=("Segoe UI", 10, "bold"), fg="#94a3b8", bg="#0e0e17"
        )
        self.status_lbl.pack(anchor="w", padx=20, pady=(4, 8))

        # Log Box
        log_frame = tk.Frame(self, bg="#0e0e17")
        log_frame.pack(fill="both", expand=True, padx=20, pady=(0, 15))

        self.log_text = tk.Text(
            log_frame, font=("Consolas", 9), bg="#09090f", fg="#22c55e",
            insertbackground="white", relief="flat", highlightbackground="#2d2d48", highlightthickness=1
        )
        scrollbar = tk.Scrollbar(log_frame, command=self.log_text.yview, bg="#161626")
        self.log_text.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side="right", fill="y")
        self.log_text.pack(side="left", fill="both", expand=True)

        self.log("Ready! Select your movie and click 'START SMART GPU CONVERSION'.\n")

    def log(self, text):
        self.log_text.insert(tk.END, text)
        self.log_text.see(tk.END)

    def browse_file(self):
        filename = filedialog.askopenfilename(
            title="Select Video File",
            filetypes=[("Video Files", "*.mp4 *.mkv *.avi *.mov *.webm"), ("All Files", "*.*")]
        )
        if filename:
            self.file_entry.delete(0, tk.END)
            self.file_entry.insert(0, filename)
            self.log(f"Selected: {filename}\n")

    def toggle_all_qualities(self):
        all_checked = self.var_1080.get() and self.var_720.get() and self.var_480.get() and self.var_360.get()
        target = not all_checked
        self.var_1080.set(target)
        self.var_720.set(target)
        self.var_480.set(target)
        self.var_360.set(target)

    def stop_conversion(self):
        self.stop_requested = True
        if self.proc:
            try:
                self.proc.terminate()
                self.log("\n[ABORTED] Conversion stopped by user (کارەکە لەسەر داوای بەکارهێنەر ڕاگیرا).\n")
                self.status_lbl.configure(text="Conversion Stopped (کارەکە ڕاگیرا)", fg="#ef4444")
            except:
                pass

    def start_conversion(self):
        video_path = self.file_entry.get().strip().strip('"')
        if not video_path or not os.path.isfile(video_path):
            messagebox.showwarning("Warning", "تکایە سەرەتا فایلی ڤیدیۆ هەڵبژێرە (Please select a valid video file)!")
            return

        chosen = []
        if self.var_1080.get(): chosen.append(1080)
        if self.var_720.get(): chosen.append(720)
        if self.var_480.get(): chosen.append(480)
        if self.var_360.get(): chosen.append(360)

        if not chosen:
            messagebox.showwarning("Warning", "تکایە بە لایەنی کەم یەک کوالیتی دیاریبکە!")
            return

        chosen.sort(reverse=True)

        self.start_btn.configure(state="disabled", bg="#475569")
        self.stop_btn.configure(state="normal", bg="#ef4444")
        self.progress["value"] = 0
        self.stop_requested = False
        self.is_running = True

        threading.Thread(target=self.run_ffmpeg_thread, args=(video_path, chosen), daemon=True).start()

    def run_ffmpeg_thread(self, video_path, chosen_qualities):
        try:
            self.log("\n" + "="*45 + "\n")
            self.log("Analyzing video metadata...\n")
            self.status_lbl.configure(text="Analyzing video metadata...", fg="#facc15")

            total_dur, detected_height = get_video_info(video_path)
            if total_dur <= 0:
                total_dur = 6500.0

            dur_min = round(total_dur / 60.0, 1)
            dur_int = int(total_dur)
            dur_formatted = f"{dur_int // 60:02d}:{dur_int % 60:02d}"

            self.log(f"Total Duration: {dur_formatted} ({dur_min} min)\n")
            self.log(f"Source Resolution: {detected_height}p\n")

            file_dir = os.path.dirname(video_path)
            base_name = os.path.splitext(os.path.basename(video_path))[0]
            clean_name = "".join([c if c.isalnum() or c in "_-" else "_" for c in base_name])
            output_dir = os.path.join(file_dir, clean_name + "_HLS")

            os.makedirs(output_dir, exist_ok=True)

            q_configs = {
                1080: {"b": "3800k", "max": "4500k", "buf": "7600k", "ab": "192k"},
                720:  {"b": "2200k", "max": "2800k", "buf": "4400k", "ab": "160k"},
                480:  {"b": "1100k", "max": "1400k", "buf": "2200k", "ab": "128k"},
                360:  {"b": "600k",  "max": "750k",  "buf": "1200k", "ab": "96k"}
            }

            q_count = len(chosen_qualities)
            q_labels = ", ".join([f"{q}p" for q in chosen_qualities])
            self.log(f"Plan: Generating {q_count} Qualities: ({q_labels})\n")
            self.log("Encoding with NVIDIA RTX NVENC GPU Turbo...\n")
            self.status_lbl.configure(text="Encoding via NVIDIA GPU Turbo...", fg="#34d399")

            filter_parts = []
            stream_maps_parts = []
            var_stream_list = []

            if q_count > 1:
                split_outs = "".join([f"[v_{q}_in]" for q in chosen_qualities])
                filter_parts.append(f"[0:v:0]split={q_count}{split_outs}")

                for i, q in enumerate(chosen_qualities):
                    os.makedirs(os.path.join(output_dir, f"v{i}"), exist_ok=True)
                    conf = q_configs[q]
                    filter_parts.append(f"[v_{q}_in]scale=w=-2:h={q},format=yuv420p[v_{q}_out]")
                    stream_maps_parts.extend([
                        "-map", f"[v_{q}_out]", f"-c:v:{i}", "h264_nvenc",
                        "-preset", "p4", f"-b:v:{i}", conf["b"],
                        f"-maxrate:v:{i}", conf["max"], f"-bufsize:v:{i}", conf["buf"],
                        "-g", "48", "-keyint_min", "48",
                        "-map", "0:a:0?", f"-c:a:{i}", "aac", f"-b:a:{i}", conf["ab"], "-ac", "2"
                    ])
                    var_stream_list.append(f"v:{i},a:{i}")
            else:
                q = chosen_qualities[0]
                os.makedirs(os.path.join(output_dir, "v0"), exist_ok=True)
                conf = q_configs[q]
                filter_parts.append(f"[0:v:0]scale=w=-2:h={q},format=yuv420p[v_{q}_out]")
                stream_maps_parts.extend([
                    "-map", f"[v_{q}_out]", "-c:v:0", "h264_nvenc",
                    "-preset", "p4", "-b:v:0", conf["b"],
                    "-maxrate:v:0", conf["max"], "-bufsize:v:0", conf["buf"],
                    "-g", "48", "-keyint_min", "48",
                    "-map", "0:a:0?", "-c:a:0", "aac", "-b:a:0", conf["ab"], "-ac", "2"
                ])
                var_stream_list.append("v:0,a:0")

            filter_complex = ";".join(filter_parts)
            var_stream_map = " ".join(var_stream_list)

            master_pl = os.path.join(output_dir, "master.m3u8")
            prog_pl = os.path.join(output_dir, "v%v", "prog.m3u8")
            seg_pl = os.path.join(output_dir, "v%v", "seg_%04d.ts")

            cmd = [
                "ffmpeg", "-hide_banner", "-y",
                "-progress", "pipe:1",
                "-stats_period", "0.25",
                "-nostats",
                "-i", video_path,
                "-filter_complex", filter_complex,
                *stream_maps_parts,
                "-f", "hls",
                "-hls_time", "6",
                "-hls_playlist_type", "vod",
                "-hls_flags", "independent_segments",
                "-hls_segment_type", "mpegts",
                "-hls_segment_filename", seg_pl,
                "-master_pl_name", "master.m3u8",
                "-var_stream_map", var_stream_map,
                prog_pl
            ]

            start_time = time.time()
            self.proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                bufsize=1, universal_newlines=True
            )

            cur_out_sec = 0.0
            cur_speed = "1.0x"
            last_ui_update = 0.0
            last_log_sec = 0.0

            if self.proc.stdout:
                for line in self.proc.stdout:
                    if self.stop_requested:
                        break
                    line = line.strip()
                    if line.startswith("out_time_us="):
                        try:
                            cur_out_sec = float(line.split("=")[1]) / 1000000.0
                        except:
                            pass
                    elif line.startswith("out_time_ms="):
                        try:
                            cur_out_sec = float(line.split("=")[1]) / 1000.0
                        except:
                            pass
                    elif line.startswith("speed="):
                        cur_speed = line.split("=")[1].strip()

                    now = time.time()
                    if now - last_ui_update >= 0.25 and total_dur > 0 and cur_out_sec > 0:
                        last_ui_update = now
                        pct = min(99.0, max(0.0, (cur_out_sec / total_dur) * 100.0))
                        self.progress["value"] = pct

                        elapsed = now - start_time
                        el_min = int(elapsed // 60)
                        el_sec = int(elapsed % 60)
                        el_str = f"{el_min:02d}:{el_sec:02d}"

                        try:
                            sp_val = float(cur_speed.replace("x", ""))
                        except:
                            sp_val = 1.0
                        if sp_val <= 0.1:
                            sp_val = 1.0

                        rem_sec = max(0.0, (total_dur - cur_out_sec) / sp_val)
                        rem_min = int(rem_sec // 60)
                        rem_sec_r = int(rem_sec % 60)
                        rem_str = f"{rem_min:02d}:{rem_sec_r:02d}"

                        self.status_lbl.configure(
                            text=f"⏳ Progress: {int(pct)}% | Speed: {cur_speed} | Elapsed: {el_str} | Remaining (ماوە): {rem_str}",
                            fg="#22d3ee"
                        )

                        if cur_out_sec - last_log_sec >= 60.0:
                            last_log_sec = cur_out_sec
                            self.log(f"Processing: {int(pct)}% | Speed: {cur_speed} | Elapsed: {el_str} | ETA: {rem_str}\n")

            self.proc.wait()

            if not self.stop_requested and self.proc.returncode == 0:
                if os.path.exists(master_pl):
                    try:
                        with open(master_pl, "r", encoding="utf-8") as f:
                            m_data = f.read()
                        m_data = m_data.replace("\\", "/")
                        with open(master_pl, "w", encoding="utf-8") as f:
                            f.write(m_data)
                    except: pass

                self.progress["value"] = 100
                total_elapsed = time.time() - start_time
                tot_min = int(total_elapsed // 60)
                tot_sec = int(total_elapsed % 60)
                tot_str = f"{tot_min:02d}:{tot_sec:02d}"

                self.status_lbl.configure(text=f"✅ Completed successfully in {tot_str}!", fg="#34d399")
                self.log("\n" + "="*45 + "\n")
                self.log(f"SUCCESS! Smart HLS Created in {tot_str}!\n")
                self.log(f"Master Playlist: {master_pl}\n")
                self.log(f"Qualities: {q_labels}\n")
                self.log("Ready for upload to Cyberduck / Cloudflare R2.\n")

                messagebox.showinfo("Success - Kurdish Stream", f"Success! HLS Created Successfully in {tot_str}!\n\nOutput Folder will now open.")
                os.startfile(output_dir)
            elif self.stop_requested:
                self.status_lbl.configure(text="Conversion Stopped by User", fg="#ef4444")
            else:
                self.log(f"\nERROR: Conversion failed with code {self.proc.returncode}\n")
                self.status_lbl.configure(text="Error during conversion!", fg="#ef4444")
                messagebox.showerror("Error", "Error during video conversion! Please check log window.")

        except Exception as ex:
            self.log(f"\nException: {str(ex)}\n")
            self.status_lbl.configure(text="Exception occurred!", fg="#ef4444")
            messagebox.showerror("Exception", str(ex))
        finally:
            self.start_btn.configure(state="normal", bg="#059669")
            self.stop_btn.configure(state="disabled", bg="#475569")
            self.is_running = False
            self.proc = None

if __name__ == "__main__":
    app = HLSConverterApp()
    app.mainloop()

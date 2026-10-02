Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Kurdish Stream - Smart Adaptive HLS Converter (Nvidia GPU Turbo)"
$form.Size = New-Object System.Drawing.Size(740, 700)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(15, 15, 24)

# Title Label
$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Kurdish Stream - Smart HLS Video Converter"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(168, 85, 247)
$titleLabel.Size = New-Object System.Drawing.Size(680, 28)
$titleLabel.Location = New-Object System.Drawing.Point(20, 12)
$form.Controls.Add($titleLabel)

# Subtitle / GPU Badge
$subLabel = New-Object System.Windows.Forms.Label
$subLabel.Text = "Hardware: NVIDIA RTX 4060 Ti Turbo | Select Output Resolutions"
$subLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9.0)
$subLabel.ForeColor = [System.Drawing.Color]::FromArgb(52, 211, 153)
$subLabel.Size = New-Object System.Drawing.Size(680, 20)
$subLabel.Location = New-Object System.Drawing.Point(20, 40)
$form.Controls.Add($subLabel)

# File Input Box
$fileTextBox = New-Object System.Windows.Forms.TextBox
$fileTextBox.Size = New-Object System.Drawing.Size(535, 30)
$fileTextBox.Location = New-Object System.Drawing.Point(20, 68)
$fileTextBox.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$fileTextBox.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 45)
$fileTextBox.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($fileTextBox)

# Browse Button
$browseBtn = New-Object System.Windows.Forms.Button
$browseBtn.Text = "Browse Video..."
$browseBtn.Size = New-Object System.Drawing.Size(135, 30)
$browseBtn.Location = New-Object System.Drawing.Point(565, 67)
$browseBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$browseBtn.BackColor = [System.Drawing.Color]::FromArgb(59, 130, 246)
$browseBtn.ForeColor = [System.Drawing.Color]::White
$browseBtn.FlatStyle = "Flat"
$browseBtn.FlatAppearance.BorderSize = 0
$browseBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($browseBtn)

# Quality Selection Group Box
$qualityGroup = New-Object System.Windows.Forms.GroupBox
$qualityGroup.Text = "Select Desired Qualities (Choose one or multiple):"
$qualityGroup.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$qualityGroup.ForeColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
$qualityGroup.Size = New-Object System.Drawing.Size(680, 64)
$qualityGroup.Location = New-Object System.Drawing.Point(20, 106)
$qualityGroup.BackColor = [System.Drawing.Color]::FromArgb(20, 20, 32)
$form.Controls.Add($qualityGroup)

# Checkbox 1080p
$cb1080 = New-Object System.Windows.Forms.CheckBox
$cb1080.Text = "1080p (FHD)"
$cb1080.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$cb1080.ForeColor = [System.Drawing.Color]::FromArgb(56, 189, 248)
$cb1080.Location = New-Object System.Drawing.Point(20, 24)
$cb1080.Size = New-Object System.Drawing.Size(115, 26)
$cb1080.Checked = $false
$qualityGroup.Controls.Add($cb1080)

# Checkbox 720p
$cb720 = New-Object System.Windows.Forms.CheckBox
$cb720.Text = "720p (HD)"
$cb720.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$cb720.ForeColor = [System.Drawing.Color]::FromArgb(74, 222, 128)
$cb720.Location = New-Object System.Drawing.Point(150, 24)
$cb720.Size = New-Object System.Drawing.Size(105, 26)
$cb720.Checked = $true
$qualityGroup.Controls.Add($cb720)

# Checkbox 480p
$cb480 = New-Object System.Windows.Forms.CheckBox
$cb480.Text = "480p (SD)"
$cb480.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$cb480.ForeColor = [System.Drawing.Color]::FromArgb(250, 204, 21)
$cb480.Location = New-Object System.Drawing.Point(275, 24)
$cb480.Size = New-Object System.Drawing.Size(105, 26)
$cb480.Checked = $false
$qualityGroup.Controls.Add($cb480)

# Checkbox 360p
$cb360 = New-Object System.Windows.Forms.CheckBox
$cb360.Text = "360p (Data Saver)"
$cb360.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$cb360.ForeColor = [System.Drawing.Color]::FromArgb(244, 114, 182)
$cb360.Location = New-Object System.Drawing.Point(400, 24)
$cb360.Size = New-Object System.Drawing.Size(145, 26)
$cb360.Checked = $true
$qualityGroup.Controls.Add($cb360)

# All / Quick Select Button
$btnSelectAll = New-Object System.Windows.Forms.Button
$btnSelectAll.Text = "Toggle All"
$btnSelectAll.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
$btnSelectAll.Size = New-Object System.Drawing.Size(85, 26)
$btnSelectAll.Location = New-Object System.Drawing.Point(575, 24)
$btnSelectAll.BackColor = [System.Drawing.Color]::FromArgb(75, 85, 99)
$btnSelectAll.ForeColor = [System.Drawing.Color]::White
$btnSelectAll.FlatStyle = "Flat"
$btnSelectAll.FlatAppearance.BorderSize = 0
$btnSelectAll.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnSelectAll.Add_Click({
    $allChecked = ($cb1080.Checked -and $cb720.Checked -and $cb480.Checked -and $cb360.Checked)
    $cb1080.Checked = -not $allChecked
    $cb720.Checked = -not $allChecked
    $cb480.Checked = -not $allChecked
    $cb360.Checked = -not $allChecked
})
$qualityGroup.Controls.Add($btnSelectAll)

# Action Buttons Panel (Start & Stop)
$convertBtn = New-Object System.Windows.Forms.Button
$convertBtn.Text = "START SMART GPU CONVERSION"
$convertBtn.Size = New-Object System.Drawing.Size(515, 42)
$convertBtn.Location = New-Object System.Drawing.Point(20, 180)
$convertBtn.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$convertBtn.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
$convertBtn.ForeColor = [System.Drawing.Color]::White
$convertBtn.FlatStyle = "Flat"
$convertBtn.FlatAppearance.BorderSize = 0
$convertBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($convertBtn)

$stopBtn = New-Object System.Windows.Forms.Button
$stopBtn.Text = "STOP / CANCEL"
$stopBtn.Size = New-Object System.Drawing.Size(155, 42)
$stopBtn.Location = New-Object System.Drawing.Point(545, 180)
$stopBtn.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$stopBtn.BackColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
$stopBtn.ForeColor = [System.Drawing.Color]::White
$stopBtn.FlatStyle = "Flat"
$stopBtn.FlatAppearance.BorderSize = 0
$stopBtn.Enabled = $false
$stopBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($stopBtn)

# Progress Bar
$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Size = New-Object System.Drawing.Size(680, 22)
$progressBar.Location = New-Object System.Drawing.Point(20, 232)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$form.Controls.Add($progressBar)

# Status Meter Label
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Status: Idle | Ready to convert"
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
$statusLabel.Size = New-Object System.Drawing.Size(680, 24)
$statusLabel.Location = New-Object System.Drawing.Point(20, 260)
$form.Controls.Add($statusLabel)

# Log Box
$logBox = New-Object System.Windows.Forms.RichTextBox
$logBox.Size = New-Object System.Drawing.Size(680, 340)
$logBox.Location = New-Object System.Drawing.Point(20, 290)
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9.5)
$logBox.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 18)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
$logBox.ReadOnly = $true
$form.Controls.Add($logBox)

$logBox.AppendText("Ready! Select your movie and click 'START SMART GPU CONVERSION'.`r`n")

# Global process tracking for clean exit
$global:activeProc = $null
$global:stopRequested = $false

$form.Add_FormClosing({
    if ($global:activeProc -and -not $global:activeProc.HasExited) {
        try {
            $global:activeProc.Kill()
        } catch {}
    }
})

# Browse Click Event
$browseBtn.Add_Click({
    $openDialog = New-Object System.Windows.Forms.OpenFileDialog
    $openDialog.Filter = "Video Files|*.mp4;*.mkv;*.avi;*.mov;*.webm|All Files|*.*"
    $openDialog.Title = "Select Movie Video File"
    if ($openDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $fileTextBox.Text = $openDialog.FileName
        $logBox.AppendText("Selected: " + $openDialog.FileName + "`r`n")
    }
})

# Stop Button Event
$stopBtn.Add_Click({
    $global:stopRequested = $true
    if ($global:activeProc -and -not $global:activeProc.HasExited) {
        try {
            $global:activeProc.Kill()
            $logBox.AppendText("`r`n[ABORTED] Conversion stopped by user.`r`n")
            $statusLabel.Text = "Conversion Stopped"
            $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
        } catch {}
    }
})

# Convert Click Event
$convertBtn.Add_Click({
    $videoPath = $fileTextBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($videoPath) -or -not ([System.IO.File]::Exists($videoPath))) {
        [System.Windows.Forms.MessageBox]::Show("Please select a valid video file first!", "Warning", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        return
    }

    # Gather chosen qualities
    $chosenQualities = @()
    if ($cb1080.Checked) { $chosenQualities += 1080 }
    if ($cb720.Checked)  { $chosenQualities += 720 }
    if ($cb480.Checked)  { $chosenQualities += 480 }
    if ($cb360.Checked)  { $chosenQualities += 360 }

    if ($chosenQualities.Count -eq 0) {
        [System.Windows.Forms.MessageBox]::Show("Please select at least one quality!", "Warning", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        return
    }

    # Sort descending: 1080, 720, 480, 360
    $chosenQualities = $chosenQualities | Sort-Object -Descending

    $global:stopRequested = $false
    $convertBtn.Enabled = $false
    $browseBtn.Enabled = $false
    $cb1080.Enabled = $false
    $cb720.Enabled = $false
    $cb480.Enabled = $false
    $cb360.Enabled = $false
    $btnSelectAll.Enabled = $false
    $stopBtn.Enabled = $true
    $stopBtn.BackColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
    $convertBtn.Text = "Converting with NVIDIA GPU Turbo..."
    $convertBtn.BackColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
    $progressBar.Value = 0

    $fileDir = [System.IO.Path]::GetDirectoryName($videoPath)
    $fileNameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($videoPath)
    $cleanName = ($fileNameWithoutExt -replace "[^a-zA-Z0-9_-]", "_") -replace "_+", "_"
    if (-not $cleanName) { $cleanName = "movie" }
    $outputDir = [System.IO.Path]::Combine($fileDir, ($cleanName + "_HLS"))

    [System.IO.Directory]::CreateDirectory($outputDir) | Out-Null
    Get-ChildItem $outputDir -Directory -Filter "v*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    $logBox.AppendText("`r`n========================================`r`n")
    $logBox.AppendText("Analyzing video metadata...`r`n")
    $statusLabel.Text = "Analyzing video metadata..."
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(250, 204, 21)
    [System.Windows.Forms.Application]::DoEvents()

    # 1. Get video height using ffprobe
    $detectedHeight = 0
    try {
        $probeH = New-Object System.Diagnostics.ProcessStartInfo
        $probeH.FileName = "ffprobe"
        $probeH.Arguments = "-v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 `"$videoPath`""
        $probeH.UseShellExecute = $false
        $probeH.RedirectStandardOutput = $true
        $probeH.CreateNoWindow = $true
        $probeHProc = [System.Diagnostics.Process]::Start($probeH)
        $hOutput = $probeHProc.StandardOutput.ReadToEnd().Trim()
        $probeHProc.WaitForExit()
        [int]::TryParse($hOutput, [ref]$detectedHeight) | Out-Null
    } catch {
        $detectedHeight = 0
    }

    if ($detectedHeight -le 0) { $detectedHeight = 1080 }

    # 2. Get duration in seconds using ffprobe
    $totalDurationSec = 0
    try {
        $probePsi = New-Object System.Diagnostics.ProcessStartInfo
        $probePsi.FileName = "ffprobe"
        $probePsi.Arguments = "-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 `"$videoPath`""
        $probePsi.UseShellExecute = $false
        $probePsi.RedirectStandardOutput = $true
        $probePsi.CreateNoWindow = $true
        $probeProc = [System.Diagnostics.Process]::Start($probePsi)
        $durOutput = $probeProc.StandardOutput.ReadToEnd().Trim()
        $probeProc.WaitForExit()
        $totalDurationSec = [double]$durOutput
    } catch {
        $totalDurationSec = 0
    }

    if ($totalDurationSec -le 0) { $totalDurationSec = 6000 }
    $durMin = [math]::Round($totalDurationSec / 60, 1)
    $durTotalSecInt = [int][math]::Round($totalDurationSec)
    $durFormatted = "{0:D2}:{1:D2}" -f [int]($durTotalSecInt / 60), ($durTotalSecInt % 60)

    $logBox.AppendText("Total Duration: " + $durFormatted + " (" + $durMin + " min)`r`n")
    $logBox.AppendText("Source Resolution: " + $detectedHeight + "p`r`n")

    # 3. Build Dynamic FFmpeg Multi-Quality Graph
    $qCount = $chosenQualities.Count
    $qualityLabels = ($chosenQualities | ForEach-Object { "$($_)p" }) -join ", "
    $planDesc = "Generating " + $qCount + " Qualities: (" + $qualityLabels + ")"

    # Quality bitrates configuration table
    $qConfig = @{
        1080 = @{ b = "3800k"; max = "4500k"; buf = "7600k"; ab = "192k" }
        720  = @{ b = "2200k"; max = "2800k"; buf = "4400k"; ab = "160k" }
        480  = @{ b = "1100k"; max = "1400k"; buf = "2200k"; ab = "128k" }
        360  = @{ b = "600k";  max = "750k";  buf = "1200k"; ab = "96k"  }
    }

    $filterParts = @()
    $streamMapsParts = @()
    $varStreamList = @()

    if ($qCount -gt 1) {
        $splitOutputs = ($chosenQualities | ForEach-Object { "[v_$($_)_in]" }) -join ""
        # Explicitly use [0:v:0] so attached cover art images are excluded
        $filterParts += "[0:v:0]split=" + $qCount + $splitOutputs
        
        for ($i = 0; $i -lt $qCount; $i++) {
            $q = $chosenQualities[$i]
            $conf = $qConfig[$q]
            [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($outputDir, "v$i")) | Out-Null

            $filterParts += "[v_${q}_in]scale=w=-2:h=${q},format=yuv420p[v_${q}_out]"
            $streamMapsParts += "-map `"[v_${q}_out]`" -c:v:$i h264_nvenc -preset p4 -b:v:$i " + $conf.b + " -maxrate:v:$i " + $conf.max + " -bufsize:v:$i " + $conf.buf + " -g 48 -keyint_min 48 -map 0:a:0? -c:a:$i aac -b:a:$i " + $conf.ab + " -ac 2"
            $varStreamList += "v:$i,a:$i"
        }
    } else {
        $q = $chosenQualities[0]
        $conf = $qConfig[$q]
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($outputDir, "v0")) | Out-Null

        $filterParts += "[0:v:0]scale=w=-2:h=${q},format=yuv420p[v_${q}_out]"
        $streamMapsParts += "-map `"[v_${q}_out]`" -c:v:0 h264_nvenc -preset p4 -b:v:0 " + $conf.b + " -maxrate:v:0 " + $conf.max + " -bufsize:v:0 " + $conf.buf + " -g 48 -keyint_min 48 -map 0:a:0? -c:a:0 aac -b:a:0 " + $conf.ab + " -ac 2"
        $varStreamList += "v:0,a:0"
    }

    $filterComplex = $filterParts -join ";"
    $streamMaps = $streamMapsParts -join " "
    $varStreamMap = $varStreamList -join " "

    $logBox.AppendText("Plan: " + $planDesc + "`r`n")
    $logBox.AppendText("Encoding via NVIDIA RTX GPU Turbo...`r`n")
    $statusLabel.Text = "Starting NVIDIA GPU Hardware Encoding..."
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(52, 211, 153)
    [System.Windows.Forms.Application]::DoEvents()

    $masterPlPath = [System.IO.Path]::Combine($outputDir, "master.m3u8")
    $progPlPath = [System.IO.Path]::Combine($outputDir, "v%v\prog.m3u8")
    $segPlPath = [System.IO.Path]::Combine($outputDir, "v%v\seg_%04d.ts")

    $progressFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "hls_progress_" + [System.Guid]::NewGuid().ToString("N") + ".txt")
    if ([System.IO.File]::Exists($progressFile)) { Remove-Item $progressFile -Force }

    $ffmpegArgs = "-hide_banner -y -progress `"$progressFile`" -stats_period 0.5 -nostats -i `"$videoPath`" -filter_complex `"$filterComplex`" $streamMaps -f hls -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename `"$segPlPath`" -master_pl_name master.m3u8 -var_stream_map `"$varStreamMap`" `"$progPlPath`""

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "ffmpeg"
    $psi.Arguments = $ffmpegArgs
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $startTime = [System.DateTime]::Now
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    
    $errBuilder = New-Object System.Text.StringBuilder
    $proc.EnableRaisingEvents = $true
    $proc.add_ErrorDataReceived({
        param($sender, $e)
        if ($e.Data) {
            [void]$errBuilder.AppendLine($e.Data)
        }
    })

    try {
        $proc.Start() | Out-Null
        $proc.BeginErrorReadLine()
        $global:activeProc = $proc

        $currentSpeed = "1.0x"
        $curOutTimeSec = 0
        $lastReportSec = 0

        while (-not $proc.HasExited -and -not $global:stopRequested) {
            if ([System.IO.File]::Exists($progressFile)) {
                try {
                    $content = [System.IO.File]::ReadAllText($progressFile)
                    if ($content) {
                        if ($content -match "out_time_us=(\d+)") {
                            $curOutTimeSec = [double]$matches[1] / 1000000.0
                        } elseif ($content -match "out_time_ms=(\d+)") {
                            $curOutTimeSec = [double]$matches[1] / 1000.0
                        }
                        if ($content -match "speed=\s*([\d\.]+)x") {
                            $currentSpeed = $matches[1] + "x"
                        }

                        if ($totalDurationSec -gt 0 -and $curOutTimeSec -gt 0) {
                            $percent = [math]::Min(99, [math]::Max(0, [math]::Round(($curOutTimeSec / $totalDurationSec) * 100)))
                            $progressBar.Value = [int]$percent

                            $elapsed = [System.DateTime]::Now - $startTime
                            $elapsedStr = "{0:D2}:{1:D2}" -f [int]$elapsed.TotalMinutes, $elapsed.Seconds

                            # Estimate remaining time (ETA)
                            $speedVal = [double]($currentSpeed -replace "x","")
                            if ($speedVal -le 0.1) { $speedVal = 1.0 }
                            $remSec = [math]::Max(0, ($totalDurationSec - $curOutTimeSec) / $speedVal)
                            $remMin = [int]($remSec / 60)
                            $remSecRemainder = [int]($remSec % 60)
                            $remStr = "{0:D2}:{1:D2}" -f $remMin, $remSecRemainder

                            $statusLabel.Text = "Progress: " + $percent + "% | Speed: " + $currentSpeed + " | Elapsed: " + $elapsedStr + " | Remaining: " + $remStr
                            $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(34, 211, 238)

                            # Periodically log speed to log box
                            if ($curOutTimeSec - $lastReportSec -ge 120) {
                                $lastReportSec = $curOutTimeSec
                                $logBox.AppendText("Processing: " + $percent + "% | Speed: " + $currentSpeed + " | Elapsed: " + $elapsedStr + " | ETA: " + $remStr + "`r`n")
                                $logBox.ScrollToCaret()
                            }
                        }
                    }
                } catch {}
            }

            [System.Threading.Thread]::Sleep(150)
            [System.Windows.Forms.Application]::DoEvents()
        }

        if (-not $global:stopRequested) {
            $proc.WaitForExit()
        }
    } catch {
        $logBox.AppendText("`r`nProcess Exception: " + $_.Exception.Message + "`r`n")
    }

    $global:activeProc = $null

    try {
        if ([System.IO.File]::Exists($progressFile)) { Remove-Item $progressFile -Force -ErrorAction SilentlyContinue }
    } catch {}

    if (-not $global:stopRequested -and $proc -and $proc.ExitCode -eq 0) {
        if ([System.IO.File]::Exists($masterPlPath)) {
            try {
                $mContent = [System.IO.File]::ReadAllText($masterPlPath)
                $mContent = $mContent -replace '\\', '/'
                [System.IO.File]::WriteAllText($masterPlPath, $mContent)
            } catch {}
        }

        $progressBar.Value = 100
        $totalElapsed = [System.DateTime]::Now - $startTime
        $totalElapsedStr = "{0:D2}:{1:D2}" -f [int]$totalElapsed.TotalMinutes, $totalElapsed.Seconds
        $statusLabel.Text = "Completed successfully in " + $totalElapsedStr + "!"
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(52, 211, 153)

        $logBox.AppendText("`r`n========================================`r`n")
        $logBox.AppendText("SUCCESS! Smart HLS Created in " + $totalElapsedStr + "!`r`n")
        $logBox.AppendText("Master Playlist: " + $masterPlPath + "`r`n")
        $logBox.AppendText("Qualities Generated: " + $qualityLabels + "`r`n")
        $logBox.AppendText("Ready for upload to Cloudflare R2 / S3 storage.`r`n")
        $logBox.ScrollToCaret()
        
        [System.Windows.Forms.MessageBox]::Show("Success! Smart HLS Created Successfully in " + $totalElapsedStr + "!`r`n`r`nPlan: " + $planDesc + "`r`n`r`nOutput folder will now open.", "Success - Kurdish Stream", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
        Invoke-Item $outputDir
    } elseif ($global:stopRequested) {
        $statusLabel.Text = "Stopped by user"
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
    } else {
        $errText = $errBuilder.ToString()
        $logBox.AppendText("`r`nERROR DETAILS:`r`n" + $errText + "`r`n")
        $logBox.ScrollToCaret()
        $statusLabel.Text = "Error during conversion! Check log below."
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
        [System.Windows.Forms.MessageBox]::Show("Error during video conversion! Please check log window for details.", "Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
    }

    $convertBtn.Enabled = $true
    $browseBtn.Enabled = $true
    $cb1080.Enabled = $true
    $cb720.Enabled = $true
    $cb480.Enabled = $true
    $cb360.Enabled = $true
    $btnSelectAll.Enabled = $true
    $stopBtn.Enabled = $false
    $stopBtn.BackColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
    $convertBtn.Text = "START SMART GPU CONVERSION"
    $convertBtn.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
})

# Launch GUI
[void]$form.ShowDialog()
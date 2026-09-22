Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Kurdish Stream - Smart Adaptive HLS Converter (Nvidia GPU Turbo)"
$form.Size = New-Object System.Drawing.Size(680, 560)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(15, 15, 24)

# Title Label
$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Kurdish Stream - Smart Adaptive HLS Converter"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(168, 85, 247)
$titleLabel.Size = New-Object System.Drawing.Size(620, 28)
$titleLabel.Location = New-Object System.Drawing.Point(20, 14)
$form.Controls.Add($titleLabel)

# Subtitle / GPU Badge
$subLabel = New-Object System.Windows.Forms.Label
$subLabel.Text = "Auto-Resolution: 1080p (480p+720p+1080p) | 720p (480p+720p) | 480p (480p)"
$subLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9.0)
$subLabel.ForeColor = [System.Drawing.Color]::FromArgb(52, 211, 153)
$subLabel.Size = New-Object System.Drawing.Size(620, 22)
$subLabel.Location = New-Object System.Drawing.Point(20, 44)
$form.Controls.Add($subLabel)

# File Input Box
$fileTextBox = New-Object System.Windows.Forms.TextBox
$fileTextBox.Size = New-Object System.Drawing.Size(480, 30)
$fileTextBox.Location = New-Object System.Drawing.Point(20, 78)
$fileTextBox.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$fileTextBox.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 45)
$fileTextBox.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($fileTextBox)

# Browse Button
$browseBtn = New-Object System.Windows.Forms.Button
$browseBtn.Text = "Browse Video..."
$browseBtn.Size = New-Object System.Drawing.Size(130, 30)
$browseBtn.Location = New-Object System.Drawing.Point(510, 77)
$browseBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$browseBtn.BackColor = [System.Drawing.Color]::FromArgb(59, 130, 246)
$browseBtn.ForeColor = [System.Drawing.Color]::White
$browseBtn.FlatStyle = "Flat"
$browseBtn.FlatAppearance.BorderSize = 0
$browseBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($browseBtn)

# Convert Button
$convertBtn = New-Object System.Windows.Forms.Button
$convertBtn.Text = "START SMART GPU CONVERSION"
$convertBtn.Size = New-Object System.Drawing.Size(620, 42)
$convertBtn.Location = New-Object System.Drawing.Point(20, 118)
$convertBtn.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$convertBtn.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
$convertBtn.ForeColor = [System.Drawing.Color]::White
$convertBtn.FlatStyle = "Flat"
$convertBtn.FlatAppearance.BorderSize = 0
$convertBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($convertBtn)

# Progress Bar
$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Size = New-Object System.Drawing.Size(620, 18)
$progressBar.Location = New-Object System.Drawing.Point(20, 170)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$form.Controls.Add($progressBar)

# Status Meter Label
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Status: Idle | Ready to convert"
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
$statusLabel.Size = New-Object System.Drawing.Size(620, 22)
$statusLabel.Location = New-Object System.Drawing.Point(20, 194)
$form.Controls.Add($statusLabel)

# Log Box
$logBox = New-Object System.Windows.Forms.RichTextBox
$logBox.Size = New-Object System.Drawing.Size(620, 270)
$logBox.Location = New-Object System.Drawing.Point(20, 222)
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9.5)
$logBox.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 18)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
$logBox.ReadOnly = $true
$form.Controls.Add($logBox)

$logBox.AppendText("Ready! Click 'Browse Video...' to select your movie (MP4/MKV).`n")

# Browse Click Event
$browseBtn.Add_Click({
    $openDialog = New-Object System.Windows.Forms.OpenFileDialog
    $openDialog.Filter = "Video Files|*.mp4;*.mkv;*.avi;*.mov;*.webm|All Files|*.*"
    $openDialog.Title = "Select Movie Video File"
    if ($openDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $fileTextBox.Text = $openDialog.FileName
        $logBox.AppendText("Selected: " + $openDialog.FileName + "`n")
    }
})

# Convert Click Event
$convertBtn.Add_Click({
    $videoPath = $fileTextBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($videoPath) -or -not ([System.IO.File]::Exists($videoPath))) {
        [System.Windows.Forms.MessageBox]::Show("Please select a valid video file first!", "Warning", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        return
    }

    $convertBtn.Enabled = $false
    $browseBtn.Enabled = $false
    $convertBtn.Text = "Analyzing & Converting... (Nvidia GPU Turbo)"
    $convertBtn.BackColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
    $progressBar.Value = 0

    $fileDir = [System.IO.Path]::GetDirectoryName($videoPath)
    $fileNameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($videoPath)
    $cleanName = ($fileNameWithoutExt -replace '[^a-zA-Z0-9_-]', '_') -replace '_+', '_'
    if (-not $cleanName) { $cleanName = "movie" }
    $outputDir = [System.IO.Path]::Combine($fileDir, ($cleanName + "_HLS"))

    [System.IO.Directory]::CreateDirectory($outputDir) | Out-Null

    $logBox.AppendText("`n========================================`n")
    $logBox.AppendText("Inspecting video metadata (Resolution & Duration)...`n")
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

    $logBox.AppendText("Duration: $durMin minutes ($([math]::Round($totalDurationSec)) seconds)`n")
    $logBox.AppendText("Detected Source Resolution Height: ${detectedHeight}p`n")

    # 3. Determine Adaptive Quality Plan based on detected height
    $planDesc = ""
    $filterComplex = ""
    $streamMaps = ""
    $varStreamMap = ""

    if ($detectedHeight -ge 1000) {
        # 1080p Source -> Output: 480p, 720p, 1080p
        $planDesc = "1080p Source -> Generating 3 Qualities: (480p, 720p, 1080p)"
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($outputDir, "v0")) | Out-Null
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($outputDir, "v1")) | Out-Null
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($outputDir, "v2")) | Out-Null

        $filterComplex = "[0:v]split=3[v1_in][v2_in][v3_in];[v1_in]scale=w=-2:h=480[v1_out];[v2_in]scale=w=-2:h=720[v2_out];[v3_in]scale=w=-2:h=1080[v3_out]"
        $streamMaps = "-map `"[v1_out]`" -c:v:0 h264_nvenc -preset p4 -b:v:0 1200k -maxrate:v:0 1500k -bufsize:v:0 2400k -g 96 -keyint_min 96 -map `"[v2_out]`" -c:v:1 h264_nvenc -preset p4 -b:v:1 2400k -maxrate:v:1 3000k -bufsize:v:1 4800k -g 96 -keyint_min 96 -map `"[v3_out]`" -c:v:2 h264_nvenc -preset p4 -b:v:2 4200k -maxrate:v:2 5000k -bufsize:v:2 8400k -g 96 -keyint_min 96 -map a:0? -c:a:0 aac -b:a:0 128k -ac 2 -map a:0? -c:a:1 aac -b:a:1 192k -ac 2 -map a:0? -c:a:2 aac -b:a:2 192k -ac 2"
        $varStreamMap = "v:0,a:0 v:1,a:1 v:2,a:2"
    } elseif ($detectedHeight -ge 650) {
        # 720p Source -> Output: 480p, 720p
        $planDesc = "720p Source -> Generating 2 Qualities: (480p, 720p)"
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($outputDir, "v0")) | Out-Null
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($outputDir, "v1")) | Out-Null

        $filterComplex = "[0:v]split=2[v1_in][v2_in];[v1_in]scale=w=-2:h=480[v1_out];[v2_in]scale=w=-2:h=720[v2_out]"
        $streamMaps = "-map `"[v1_out]`" -c:v:0 h264_nvenc -preset p4 -b:v:0 1200k -maxrate:v:0 1500k -bufsize:v:0 2400k -g 96 -keyint_min 96 -map `"[v2_out]`" -c:v:1 h264_nvenc -preset p4 -b:v:1 2400k -maxrate:v:1 3000k -bufsize:v:1 4800k -g 96 -keyint_min 96 -map a:0? -c:a:0 aac -b:a:0 128k -ac 2 -map a:0? -c:a:1 aac -b:a:1 192k -ac 2"
        $varStreamMap = "v:0,a:0 v:1,a:1"
    } elseif ($detectedHeight -ge 400) {
        # 480p Source -> Output: 480p Only
        $planDesc = "480p Source -> Generating 1 Quality: (480p)"
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($outputDir, "v0")) | Out-Null

        $filterComplex = "[0:v]scale=w=-2:h=480[v1_out]"
        $streamMaps = "-map `"[v1_out]`" -c:v:0 h264_nvenc -preset p4 -b:v:0 1200k -maxrate:v:0 1500k -bufsize:v:0 2400k -g 96 -keyint_min 96 -map a:0? -c:a:0 aac -b:a:0 128k -ac 2"
        $varStreamMap = "v:0,a:0"
    } else {
        # <= 360p Source -> Output: 360p Only
        $planDesc = "360p Source -> Generating 1 Quality: (360p)"
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($outputDir, "v0")) | Out-Null

        $filterComplex = "[0:v]scale=w=-2:h=360[v1_out]"
        $streamMaps = "-map `"[v1_out]`" -c:v:0 h264_nvenc -preset p4 -b:v:0 600k -maxrate:v:0 750k -bufsize:v:0 1200k -g 96 -keyint_min 96 -map a:0? -c:a:0 aac -b:a:0 96k -ac 2"
        $varStreamMap = "v:0,a:0"
    }

    $logBox.AppendText("Plan: $planDesc`n")
    $logBox.AppendText("Output Folder: $outputDir`n")
    $logBox.AppendText("Encoding via Nvidia RTX NVENC...`n")
    [System.Windows.Forms.Application]::DoEvents()

    $masterPlPath = [System.IO.Path]::Combine($outputDir, "master.m3u8")
    $progPlPath = [System.IO.Path]::Combine($outputDir, "v%v\prog.m3u8")
    $segPlPath = [System.IO.Path]::Combine($outputDir, "v%v\seg_%04d.ts")

    $ffmpegArgs = "-y -progress pipe:1 -stats_period 0.5 -hwaccel auto -i `"$videoPath`" -filter_complex `"$filterComplex`" $streamMaps -f hls -hls_time 4 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename `"$segPlPath`" -master_pl_name master.m3u8 -var_stream_map `"$varStreamMap`" `"$progPlPath`""

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "ffmpeg"
    $psi.Arguments = $ffmpegArgs
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $startTime = [System.DateTime]::Now
    $proc = [System.Diagnostics.Process]::Start($psi)

    $currentSpeed = "1.0x"
    $curOutTimeSec = 0

    while (-not $proc.HasExited) {
        $line = $proc.StandardOutput.ReadLine()
        if ($line) {
            if ($line -match 'out_time_us=(\d+)') {
                $curOutTimeSec = [double]$matches[1] / 1000000.0
            } elseif ($line -match 'out_time_ms=(\d+)') {
                $curOutTimeSec = [double]$matches[1] / 1000.0
            } elseif ($line -match 'speed=\s*([\d\.]+)x') {
                $currentSpeed = $matches[1] + "x"
            }

            if ($totalDurationSec -gt 0 -and $curOutTimeSec -gt 0) {
                $percent = [math]::Min(99, [math]::Max(0, [math]::Round(($curOutTimeSec / $totalDurationSec) * 100)))
                $progressBar.Value = [int]$percent

                $elapsed = [System.DateTime]::Now - $startTime
                $elapsedStr = "{0:D2}:{1:D2}" -f [int]$elapsed.TotalMinutes, $elapsed.Seconds

                # Estimate remaining time
                $speedVal = [double]($currentSpeed -replace 'x','')
                if ($speedVal -le 0) { $speedVal = 1.0 }
                $remSec = [math]::Max(0, ($totalDurationSec - $curOutTimeSec) / $speedVal)
                $remMin = [int]($remSec / 60)
                $remSecRemainder = [int]($remSec % 60)
                $remStr = "{0:D2}:{1:D2}" -f $remMin, $remSecRemainder

                $statusLabel.Text = "Progress: $percent% | Speed: $currentSpeed | Elapsed: $elapsedStr | Remaining (ETA): $remStr"
                $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(34, 211, 238)
            }
        }
        [System.Windows.Forms.Application]::DoEvents()
    }

    $proc.WaitForExit()

    if ($proc.ExitCode -eq 0) {
        $progressBar.Value = 100
        $totalElapsed = [System.DateTime]::Now - $startTime
        $totalElapsedStr = "{0:D2}:{1:D2}" -f [int]$totalElapsed.TotalMinutes, $totalElapsed.Seconds
        $statusLabel.Text = "Completed in $totalElapsedStr! (100%)"
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(52, 211, 153)

        $logBox.AppendText("`n========================================`n")
        $logBox.AppendText("SUCCESS! Smart HLS Created in $totalElapsedStr!`n")
        $logBox.AppendText("Master File: $masterPlPath`n")
        $logBox.AppendText("Upload this folder to Cloudflare R2 via Cyberduck.`n")
        
        [System.Windows.Forms.MessageBox]::Show("Success! Smart HLS Created Successfully in $totalElapsedStr!`n`nPlan: $planDesc`n`nOutput folder will now open.", "Success", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
        Invoke-Item $outputDir
    } else {
        $errText = $proc.StandardError.ReadToEnd()
        $logBox.AppendText("`nERROR: " + $errText + "`n")
        $statusLabel.Text = "Error during conversion!"
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
        [System.Windows.Forms.MessageBox]::Show("Error during video conversion! Please check log.", "Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
    }

    $convertBtn.Enabled = $true
    $browseBtn.Enabled = $true
    $convertBtn.Text = "START SMART GPU CONVERSION"
    $convertBtn.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
})

[void]$form.ShowDialog()

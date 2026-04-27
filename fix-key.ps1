$raw = [System.IO.File]::ReadAllText("$HOME\.ssh\tdodj-ec2.pem")
$body = $raw -replace '-----BEGIN RSA PRIVATE KEY-----', ''
$body = $body -replace '-----END RSA PRIVATE KEY-----', ''
$body = $body -replace '\r', ''
$body = $body -replace '\n', ''
$body = $body.Trim()

$lines = New-Object System.Collections.Generic.List[string]
$i = 0
while ($i -lt $body.Length) {
    $len = [Math]::Min(64, $body.Length - $i)
    $lines.Add($body.Substring($i, $len))
    $i += 64
}

$nl = [char]10
$pem = "-----BEGIN RSA PRIVATE KEY-----" + $nl + ($lines -join $nl) + $nl + "-----END RSA PRIVATE KEY-----" + $nl

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("$HOME\.ssh\tdodj-ec2.pem", $pem, $utf8NoBom)

Write-Host "Done. File size: $([System.IO.File]::ReadAllBytes("$HOME\.ssh\tdodj-ec2.pem").Length) bytes"

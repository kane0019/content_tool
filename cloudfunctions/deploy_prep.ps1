# deploy_prep.ps1
# Copy shared JS files into each cloud function directory before uploading.
# Usage: run from content_tool root ->  .\cloudfunctions\deploy_prep.ps1

$shared   = "$PSScriptRoot\_shared"
$llmFuncs = @("generateContent", "refineContent")

foreach ($func in $llmFuncs) {
    $dest = "$PSScriptRoot\$func"
    Copy-Item "$shared\promptEngine.js" $dest -Force
    Copy-Item "$shared\llmClient.js"    $dest -Force
    Write-Host "copied promptEngine.js + llmClient.js -> $func"
}

Write-Host "Done. Upload each cloud function directory via WeChat DevTools."

# Starts the server with the emerging-feed settings. Asks for the key and the admin token; nothing is saved.
# Run it from the project folder:  powershell -ExecutionPolicy Bypass -File .\scripts\start-emerging.ps1
$env:EMERGING_API_URL = "https://api.deepseek.com/chat/completions"
$env:EMERGING_API_MODEL = "deepseek-flash"
$env:EMERGING_API_KEY = Read-Host "DeepSeek key"
$env:EMERGING_ADMIN_TOKEN = Read-Host "Admin token (any long text you will remember)"
Clear-Host
Write-Host "Starting the server. Leave this window open. Use scripts\refresh-emerging.ps1 in another window."
npm start

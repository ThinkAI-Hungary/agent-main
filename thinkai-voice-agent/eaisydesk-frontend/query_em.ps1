$em_env = Get-Content 'C:\Users\Zombo\Desktop\Antigrav\!SKILLS\thinkai-skills\skills\thinkai-error-memory\.env' | ConvertFrom-StringData
$ref = $em_env.THINKAI_EM_REF
$key = $em_env.THINKAI_EM_KEY
$headers = @{ 
    'apikey' = $key
    'Authorization' = "Bearer $key"
    'Content-Type' = 'application/json'
    'User-Agent' = 'ThinkAI-Server'
}
$url = "https://$ref.supabase.co/rest/v1/error_records?a1_domain=eq.frontend-ui&limit=5"
$resp = Invoke-RestMethod -Uri $url -Headers $headers
$resp | ConvertTo-Json

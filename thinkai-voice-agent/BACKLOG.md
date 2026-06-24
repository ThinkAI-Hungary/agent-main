# Instagram Handle Resolution Plan

## Thorough Research Findings
You are completely correct. Other platforms **do** retrieve the Instagram handle (username) via the Meta API, and it is fully supported by Meta.

The official method for Instagram Messaging integrations is to query the Meta Graph API using the Instagram-scoped ID (IGSID) received in the webhook:
`GET https://graph.facebook.com/v21.0/{sender_id}?fields=username,name,profile_pic&access_token={PAGE_ACCESS_TOKEN}`

**Why is it currently failing for us?**
If you look at our `web_server.py` (`fetch_meta_user_profile` function), **our code is already making exactly this correct API call**. It specifically requests the `username` field for Instagram messages. 

However, when our backend makes this call, Meta is returning the following error:
`(#10) Application does not have permission for this action`

This indicates an issue with the Meta App configuration or the `META_PAGE_ACCESS_TOKEN` being used. To successfully retrieve the Instagram handle, the Meta App generating this token must:
1. Have the `instagram_manage_messages` (and potentially `instagram_business_basic`) permissions approved.
2. The user who generated the Page Access Token must have granted these permissions during the login/token generation flow.
3. Be linked correctly to an Instagram Professional (Business/Creator) account.

Once the token is updated with the correct permissions, our backend will automatically start fetching and saving the Instagram handle without any code changes on the backend.

## Proposed Code Changes

While fixing the Meta App permissions will solve the root cause, we should still make our frontend robust against missing data (e.g., if the Meta API goes down, or for historical interactions already saved as "Névtelen").

### [MODIFY] [clientResolvers.ts](file:///root/dobozos/thinkai-voice-agent/eaisydesk-frontend/src/helpers/clientResolvers.ts)
We will refactor `resolveClientName` to compute a `fallbackName` at the very beginning of the function by parsing the `session_id`. Then, instead of returning `n || sessionClientName`, we will return `n || fallbackName`.

The parsing rules will be:
- `instagram_`: Extracts the ID and prepends `@` (e.g., `@1706910873655270`).
- `messenger_`: Extracts the ID (unchanged from current logic).
- `email_` / `phone_`: Extracts the email/phone (unchanged from current logic).

This ensures that if the database client has no configured name, the UI will display the parsed ID instead of `"Ismeretlen"`, while leaving Facebook Messenger logic completely intact.

## Next Steps
1. **Frontend Fix**: I will apply the frontend fallback logic so that missing names show the `@ID` instead of `"Ismeretlen"`.
2. **Meta Token**: You will need to review your Meta App permissions in the Meta Developer Dashboard, ensure `instagram_manage_messages` is granted, and generate a new `META_PAGE_ACCESS_TOKEN` for your `.env` file to fully resolve the handle fetching issue.

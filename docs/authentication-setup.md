# Authentication and email delivery setup

This guide summarizes the configuration steps required to make the invitation-based login flow work end to end.

## 1. Prerequisites

- PostgreSQL database configured via `DATABASE_URL` (or the individual `PG*` variables).
- Backend deployed and reachable over HTTPS.
- Frontend deployed and reachable over HTTPS (Railway subdomain or a custom domain such as `https://app.nboard.au`).
- A verified sender domain in Resend (for example, ownership of `nboard.au` with DNS records in place).

## 2. Backend environment variables

Provide the following variables in the backend service (for example, inside Railway → Environment):

```dotenv
DATABASE_URL=postgres://<user>:<password>@<host>:<port>/<database>
SUPER_ADMIN_EMAIL=knpavlov@gmail.com
RESEND_API_KEY=re_********************************
RESEND_FROM=Recruitment 2.0 <login@nboard.au>
INVITE_URL=https://app.nboard.au/login
```

Notes:

- `RESEND_API_KEY` must come from the Resend dashboard (`API Keys` section).
- `RESEND_FROM` must use a sender address that is verified under the same domain inside Resend. Для этого не требуется почтовый ящик у регистратора — достаточно подтвердить домен в Resend и указать желаемый адрес вида `Recruitment 2.0 <login@nboard.au>`.
- `INVITE_URL` should point to the login screen; use your current Railway frontend URL if the app is not yet on a custom domain.
- `SUPER_ADMIN_EMAIL` controls which address receives the seed super admin account during migrations and defaults to `knpavlov@gmail.com` when the variable is omitted.

If you ever prefer SMTP over Resend, replace the `RESEND_*` variables with the `SMTP_*` variables described in the root `README.md`.

## 3. Frontend environment variables

Set the API base URL for the frontend build so the SPA can call the backend:

```dotenv
VITE_API_URL=https://api.nboard.au
```

Adjust the value to the real backend origin. Если фронтенд и бэкенд работают на Railway и используют домены вида
`https://<project>-frontend.up.railway.app` и `https://<project>-backend.up.railway.app`, можно оставить переменную
неуказанной — приложение автоматически подставит второй домен. Если имена сервисов отличаются от шаблона
«frontend/backend» или вы переключитесь на собственный домен, задайте явный адрес API, например
`https://your-backend-service.up.railway.app`.

> ℹ️ Ранее использовалась переменная `VITE_API_BASE_URL`. Фронтенд всё ещё понимает это имя для обратной совместимости, но рекомендуется переименовать её в `VITE_API_URL`, чтобы конфигурация совпадала с документацией и будущими инструкциями по миграции.

## 4. DNS and domain checklist

1. Point the desired subdomain (for example, `app.nboard.au`) to your frontend hosting provider.
2. Point another subdomain (for example, `api.nboard.au`) to the backend hosting provider.
3. In your DNS zone add the Resend verification records: DKIM (`resend._domainkey`), SPF (`send` TXT), and MX (`feedback-smtp.ap-northeast-1.amazonses.com`).
4. (Recommended) Add a DMARC TXT record such as `v=DMARC1; p=none; rua=mailto:postmaster@nboard.au`.

Wait for DNS propagation and confirm the domain status in the Resend dashboard. Если вы переключили фронтенд на новый домен,
обновите `RESEND_FROM` и убедитесь, что Resend показывает статус **Verified** для этого домена — иначе отправка писем будет
заблокирована.

## 5. End-to-end verification

1. **Restart** the backend after updating variables so the process picks up the new configuration.
2. Open the **Account management** screen as the super admin and invite a test email address.
3. Confirm that an **invitation email** arrives from `Recruitment 2.0 <login@nboard.au>` and that the link leads to your login page with the email pre-filled.
4. On the login page, submit the email to request a **one-time access code** and verify that the code arrives within a few seconds.
5. Enter the code, tick **Keep me signed in** if you want a long session, and ensure the dashboard opens with the correct role-based navigation.
6. Use the **Sign out** button in the sidebar and confirm you return to the login screen.

If any step fails, check the backend logs. When email delivery is misconfigured the API returns HTTP 503 with the error code `mailer-unavailable`. If the sender domain is not verified in Resend you will receive HTTP 424 with the code `mailer-domain`. Other provider-side failures are reported as HTTP 502. The UI displays dedicated messages so you can fix the settings before retrying.

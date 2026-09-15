# HUSTLE HUB v3.1 (Railway-ready)

Privacy-focused temporary email platform.

This version is prepared for easy public deployment on **Railway** so anyone can access it like a normal website. Data is stored on the cloud (not on your phone).

---

## Default credentials & payment account

| Item              | Value                                              |
|-------------------|----------------------------------------------------|
| **Admin secret**  | `37fa4efa3decca0f446755bc8f5ea6cab6f758a1a125e6ae` |
| **Bank**          | Opay                                               |
| **Account number**| 9014800674                                         |
| **Account name**  | Oluwayemisi Alice Atimiri                          |

You can change these later with environment variables on Railway.

---

# COMPLETE DEPLOYMENT GUIDE (Android phone only)

Follow every step carefully. You do not need a computer.

## PART 1 – Prepare the files on your phone

1. Download the zip file of this project to your phone.
2. Open the zip with any file manager (Files by Google, Solid Explorer, etc.) and extract it.
3. You should now have a folder named `hustle-hub-v3` that contains these exact files and folders:

```
hustle-hub-v3/
├── public/
│   └── index.html
├── .env.example
├── .gitignore
├── Dockerfile
├── package.json
├── README.md
└── server.js
```

Remember this folder – you will upload everything inside it to GitHub.

---

## PART 2 – Create a GitHub account and repository

1. Open Chrome on your phone and go to: https://github.com
2. Tap **Sign up** and create a free account (use any email).
3. After you are logged in, tap the **+** icon (top right) → **New repository**.
4. Fill in:
   - Repository name: `hustle-hub` (or any name you like)
   - Description: leave empty
   - Choose **Public**
   - Do **NOT** tick “Add a README file”
5. Tap **Create repository**.

You will now see an empty repository page.

---

## PART 3 – Upload all the project files to GitHub

1. On the empty repository page, look for the text **“uploading an existing file”** and tap it.
2. Tap **choose your files** (or the file picker).
3. Go into the extracted `hustle-hub-v3` folder on your phone.
4. Select **ALL** of these items (you can select multiple):

   - The entire `public` folder
   - `.env.example`
   - `.gitignore`
   - `Dockerfile`
   - `package.json`
   - `README.md`
   - `server.js`

5. After selecting them, GitHub will show the list of files ready to upload.
6. Scroll down, write a short message like “first upload”, then tap **Commit changes**.

Wait until the upload finishes. Your repository should now contain all the files.

---

## PART 4 – Deploy on Railway

1. Still on your phone, open a new tab and go to: https://railway.app
2. Tap **Login** → choose **Login with GitHub** and authorize Railway.
3. After login, tap **New Project**.
4. Choose **Deploy from GitHub repo**.
5. Select the `hustle-hub` repository you created.
6. Railway will start building the project automatically. Wait 1–3 minutes until it shows “Success” or a green status.

---

## PART 5 – Add persistent storage (so data is never lost)

This step is very important. Without it the database and payment slips disappear when the server restarts.

1. On Railway, open your new service (the one that just deployed).
2. Look for **Variables** (or Settings → Variables) and add these if you want:

```
ADMIN_SECRET=37fa4efa3decca0f446755bc8f5ea6cab6f758a1a125e6ae
BANK_NAME=Opay
BANK_ACCOUNT=9014800674
ACCOUNT_NAME=Oluwayemisi Alice Atimiri
```

(You can skip them – the defaults already work.)

3. Now add a Volume:
   - Go to the **Volumes** section (or Settings → Volumes / Storage).
   - Create / Attach a new volume.
   - Mount path must be exactly: `/data`
   - Size: the free 0.5 GB is enough for a long time.

4. After adding the volume, Railway will redeploy. Wait for it to finish.

---

## PART 6 – Get your public website link

1. On the Railway service page look for **Settings** → **Networking** or the **Domains** section.
2. Railway automatically gives you a public URL that looks like:

```
https://hustle-hub-production-xxxx.up.railway.app
```

or

```
https://hustle-hub-xxxx.up.railway.app
```

3. Copy that link. That is now your real public website.
4. Open it in any browser on any phone or computer – it works like a normal website.

Admin panel:  
Open `https://YOUR-RAILWAY-URL/#admin`  
and paste the admin secret:  
`37fa4efa3decca0f446755bc8f5ea6cab6f758a1a125e6ae`

---

## PART 7 – How to update the site later

1. Make changes on your phone.
2. Go back to the GitHub repository → Upload the new files again (or use the web editor).
3. Railway will automatically detect the change and redeploy.

---

## What this version already fixed for you

- Database and payment-slip uploads are stored under `/data` so one Railway volume keeps everything.
- Dockerfile is ready for Railway.
- Defaults already contain your Opay account and admin secret.
- Works without buying any domain (simulation mode).

---

## Local testing (optional – only if you want)

If you ever want to test on a computer or Termux later:

```bash
cd hustle-hub-v3
npm install
npm start
```

Open http://localhost:3000

---

## Important notes

- Railway free plan has limited monthly credit. For light traffic it is usually enough. If the site goes offline you can upgrade to the cheap Hobby plan ($5/month).
- Always keep a copy of the admin secret safe.
- Payment slips are stored on the Railway volume – they are private and only the admin can see them.

You are done. Share your Railway link with users and they can access HUSTLE HUB from any device in the world.

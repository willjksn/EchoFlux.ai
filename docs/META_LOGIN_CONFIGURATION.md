# Meta Login Configuration (Fix "This app needs at least one supported permission")

If your app is **Live** but non-admin users still see **"This app isn't available"** or **"This app needs at least one supported permission"**, your app is likely a **Business-type** app. Meta requires a **Login Configuration** and its ID in the OAuth URL. EchoFlux uses that via two environment variables.

---

## Part A: Create one Login Configuration in the Meta dashboard

### 1. Open your app

- Go to **https://developers.facebook.com/**
- Log in and click **My Apps** (top right), then select your EchoFlux app.

### 2. Open Facebook Login settings

- In the **left sidebar**, find **Products**.
- Click **Facebook Login** (under Products).
- You may see:
  - **Facebook Login** → **Settings**, or  
  - **Facebook Login for Business** → **Configurations**, or  
  - A **Settings** or **Configurations** link under Facebook Login.  
- Click **Settings** or **Configurations** (whichever your app shows).

### 3. Add a new configuration

- On that page, look for a section named **Login configurations** or **Client OAuth Login** / **Web OAuth Login**.
- Look for a button like **Add Configuration**, **Create configuration**, or **+ Add**.
- Click it to create a new login configuration.

### 4. Name and permissions

- **Name:** e.g. `EchoFlux` (anything you like).
- **Permissions:** You need to add permissions to this configuration. There is usually a list or dropdown. Add these (or as many as your app’s UI allows):
  - `public_profile`
  - `email`
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_posts`
  - `instagram_basic`
  - `instagram_content_publish`
  - `instagram_manage_comments`
  - `instagram_manage_insights`
- Save / Create the configuration.

### 5. Copy the Configuration ID

- After saving, the app shows a **Configuration ID** (a long number, e.g. `1234567890123456`).
- Copy that number and keep it handy for Part B.

**If you don’t see “Configurations” or “Add Configuration”:** Your app might be a **Consumer** app, not Business. In that case this error can still appear; try checking **App Review → Permissions and Features** and ensure the permissions above have **Advanced Access** approved. If your app type is **Business**, the Login Configuration step is required and the option is usually under **Facebook Login** in the sidebar.

---

## Part B: Put that ID into Vercel (environment variables)

### 1. Open your project in Vercel

- Go to **https://vercel.com** and open the project that runs EchoFlux (e.g. engagesuite.ai / EchoFlux.ai).

### 2. Open Environment Variables

- Click **Settings** (top tab).
- In the left sidebar, click **Environment Variables**.

### 3. Add two variables (same value is fine)

You will add **two** variables. You can use the **same** Configuration ID for both if you only created one configuration (with all permissions).

- Click **Add New** (or **Add**).
  - **Name:** `META_LOGIN_CONFIG_FACEBOOK`  
  - **Value:** paste the Configuration ID you copied in Part A (e.g. `1234567890123456`)  
  - **Environment:** leave as **Production** (or add for Preview too if you test on preview URLs).  
  - Save.

- Click **Add New** again.
  - **Name:** `META_LOGIN_CONFIG_INSTAGRAM`  
  - **Value:** paste the **same** Configuration ID again (same number).  
  - **Environment:** same as above.  
  - Save.

So in the list you should see:

- `META_LOGIN_CONFIG_FACEBOOK` = (your config ID)
- `META_LOGIN_CONFIG_INSTAGRAM` = (same config ID)

### 4. Redeploy

- Go to the **Deployments** tab.
- Open the **...** menu on the latest deployment and choose **Redeploy** (or push a new commit so Vercel builds again).  
This makes the new env vars active.

---

## Part C: Test

Use an account that is **not** an Admin/Developer/Tester of the app. In EchoFlux, click **Connect Facebook** or **Connect Instagram**. You should see the normal Meta consent screen and then be redirected back to EchoFlux.

---

## If users see someone else's Instagram (e.g. yours)

If the user sees **your** (admin's) Instagram when they connect, they are using a browser where **you** are logged into Facebook. Meta shows the account that is currently logged in.

**What they should do:**

- Log out of Facebook in that browser, or  
- Use a **private/incognito** window and log into Facebook with **their** account, then try Connect again.

EchoFlux cannot force Meta to show a different account; the user must be logged into Facebook as themselves.

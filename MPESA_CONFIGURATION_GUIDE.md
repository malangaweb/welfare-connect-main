# M-Pesa Configuration Guide - Settings Page

## ✅ What Was Updated

The **Settings > M-Pesa API** tab has been enhanced with:

### New Features:
1. **📋 Help Guide** - Step-by-step instructions to get M-Pesa credentials
2. **📡 Test Connection Button** - Verify credentials before saving
3. **🔒 Password Fields** - Secure input for sensitive credentials
4. **💡 Helpful Hints** - Field descriptions and requirements
5. **🎨 Environment Selector** - Easy switch between Sandbox and Production

---

## 🔧 How to Configure M-Pesa Credentials

### Step 1: Navigate to Settings
1. Login as Super Admin
2. Click on **Settings** in the navigation
3. Click on the **M-Pesa API** tab

### Step 2: Get Your Credentials

#### For Sandbox (Testing):
1. Go to https://developer.safaricom.co.ke
2. Create/login to your account
3. Create a new app
4. Copy the **Consumer Key** and **Consumer Secret**
5. Get your **Passkey** from the app settings
6. Use shortcode: `174379` (Sandbox shortcode)

#### For Production (Live):
1. Complete the sandbox testing first
2. Apply for production access on Daraja portal
3. Get production Consumer Key and Secret
4. Get your production Passkey
5. Use your company's Paybill/Shortcode
6. Create an initiator for B2C/reversals
7. Encrypt initiator password with M-Pesa public key

### Step 3: Enter Credentials

Fill in all fields:

| Field | Description | Example |
|-------|-------------|---------|
| **Environment** | Choose Sandbox or Production | Sandbox |
| **Shortcode/Paybill** | Your M-Pesa shortcode | 174379 |
| **Consumer Key** | From Daraja portal | `abc123...` |
| **Consumer Secret** | From Daraja portal | `xyz789...` |
| **Passkey** | For STK Push password generation | `bfb279f9aa9...` |
| **Initiator Name** | For B2C/reversals | `testapi` |
| **Initiator Password** | Encrypted security credential | `encrypted...` |

### Step 4: Test Connection
1. Click the **📡 Test Connection** button
2. Wait for the response
3. If successful, you'll see: `✅ Connection Successful!`
4. If failed, check your credentials and try again

### Step 5: Save Configuration
1. Click **Save M-Pesa Configuration**
2. Wait for confirmation
3. Your settings are now saved in the database

---

## 🧪 Testing M-Pesa Features

After configuring credentials, test each feature:

### Test STK Push:
1. Go to **Transactions** page
2. Click **Record Payment**
3. Select a member
4. Choose **M-Pesa** as payment method
5. Enter phone number and amount
6. Click **Send STK Push**
7. Check phone for M-Pesa prompt
8. Enter PIN to complete

### Test B2C (Disbursement):
1. Go to **Transactions** page
2. Find a disbursement transaction
3. Click **Disburse**
4. Enter member phone number
5. Select M-Pesa as method
6. Complete the B2C payment

### Test Reversal:
1. Go to **Transactions** page
2. Find a transaction to reverse
3. Click **Revert**
4. Enter reversal reason
5. Check **Process M-Pesa reversal** if needed
6. Click **Reverse Transaction**

---

## 🔐 Security Best Practices

1. **Never share credentials** - Keep Consumer Secret and Passkey private
2. **Use Sandbox for testing** - Don't test with production credentials
3. **Rotate credentials regularly** - Update every 90 days
4. **Encrypt Initiator Password** - Required for production B2C
5. **Limit access** - Only Super Admin should access Settings
6. **Monitor transactions** - Regularly review M-Pesa transaction logs

---

## 🆘 Troubleshooting

### Test Connection Fails:
- ✅ Check internet connection
- ✅ Verify Consumer Key and Secret are correct
- ✅ Ensure no extra spaces in credentials
- ✅ Try switching between Sandbox/Production
- ✅ Check Daraja portal status

### STK Push Not Working:
- ✅ Verify Passkey is correct
- ✅ Check shortcode matches your app
- ✅ Ensure phone number format is correct (254XXXXXXXXX)
- ✅ Check M-Pesa service status

### B2C/Reversal Fails:
- ✅ Verify Initiator Name is created on Daraja portal
- ✅ Ensure Initiator Password is encrypted (production only)
- ✅ Check you have sufficient funds in M-Pesa account
- ✅ Verify B2C limits haven't been exceeded

---

## 📞 Support

**M-Pesa Daraja Support:**  
https://developer.safaricom.co.ke/support

**Supabase Dashboard:**  
https://supabase.com/dashboard/project/hfojxbfcjozguobwtcgt

**Edge Function Logs:**  
Dashboard > Functions > [Select Function] > Logs

---

**Last Updated:** March 14, 2026

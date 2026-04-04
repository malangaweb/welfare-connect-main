@echo off
REM Deploy refactored M-Pesa webhook functions to Supabase

echo ========================================
echo Deploying M-Pesa Webhook Functions
echo ========================================
echo.

echo [1/2] Deploying C2B Webhook...
echo.
call supabase functions deploy mpesa-c2b-webhook

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ FAILED: C2B Webhook deployment failed!
    echo Please check your Supabase credentials and try again.
    goto :end
)

echo.
echo [2/2] Deploying STK Callback...
echo.
call supabase functions deploy mpesa-callback

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ FAILED: STK Callback deployment failed!
    echo Please check your Supabase credentials and try again.
    goto :end
)

echo.
echo ========================================
echo ✅ SUCCESS: Both functions deployed!
echo ========================================
echo.
echo NEXT STEPS:
echo 1. Wait for deployment to propagate (30 seconds)
echo 2. Send a test M-Pesa payment
echo 3. Check Supabase Edge Functions logs
echo 4. Run: check_record_dates.sql to verify no new empty records
echo.

:end
pause

// M-Pesa Daraja API Integration
// Reference: https://developer.safaricom.co.ke/docs

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  businessName: string;
  initiatorName: string;
  initiatorPassword: string;
  environment: 'sandbox' | 'production';
}

export interface StkPushRequest {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}

export interface StkPushResponse {
  RequestId: string;
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
}

export interface StkPushCallback {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: string | number;
        }>;
      };
    };
  };
}

export class MpesaClient {
  private config: MpesaConfig;
  private accessToken: string = '';
  private tokenExpiry: number = 0;

  constructor(config: MpesaConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.environment === 'sandbox'
      ? 'https://sandbox.safaricom.co.ke'
      : 'https://api.safaricom.co.ke';
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    const auth = Buffer.from(
      `${this.config.consumerKey}:${this.config.consumerSecret}`
    ).toString('base64');

    const response = await fetch(
      `${this.getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;

    return this.accessToken;
  }

  private getTimestamp(): string {
    const now = new Date();
    return now
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);
  }

  private generatePassword(): string {
    const timestamp = this.getTimestamp();
    const key = `${this.config.shortCode}${this.config.passkey}${timestamp}`;
    return Buffer.from(key).toString('base64');
  }

  async initiateStkPush(request: StkPushRequest): Promise<StkPushResponse> {
    const token = await this.getAccessToken();
    const timestamp = this.getTimestamp();
    const password = this.generatePassword();

    // Format phone number: remove + and ensure 254 prefix
    const phone = request.phoneNumber
      .replace(/^\+?/, '')
      .replace(/^0/, '254');

    const payload = {
      BusinessShortCode: this.config.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: request.amount,
      PartyA: phone,
      PartyB: this.config.shortCode,
      PhoneNumber: phone,
      AccountReference: request.accountReference,
      TransactionDesc: request.transactionDesc,
      CallBackURL: `${process.env.VITE_APP_URL || 'http://localhost:5173'}/api/mpesa/callback`,
    };

    const response = await fetch(
      `${this.getBaseUrl()}/stkpush/v1/processrequest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error(`STK Push failed: ${response.statusText}`);
    }

    return await response.json();
  }

  async checkTransactionStatus(
    checkoutRequestId: string
  ): Promise<any> {
    const token = await this.getAccessToken();
    const timestamp = this.getTimestamp();
    const password = this.generatePassword();

    const payload = {
      BusinessShortCode: this.config.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const response = await fetch(
      `${this.getBaseUrl()}/stkpushquery/v1/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error(`Query failed: ${response.statusText}`);
    }

    return await response.json();
  }

  async sendB2C(
    receiverPhone: string,
    amount: number,
    reason: string
  ): Promise<any> {
    const token = await this.getAccessToken();

    // Format phone number
    const phone = receiverPhone
      .replace(/^\+?/, '')
      .replace(/^0/, '254');

    const payload = {
      InitiatorName: this.config.initiatorName,
      SecurityCredential: this.config.initiatorPassword, // Should be encrypted
      CommandID: 'BusinessPayment',
      Amount: amount,
      PartyA: this.config.shortCode,
      PartyB: phone,
      Remarks: reason,
      QueueTimeOutURL: `${process.env.VITE_APP_URL || 'http://localhost:5173'}/api/mpesa/timeout`,
      ResultURL: `${process.env.VITE_APP_URL || 'http://localhost:5173'}/api/mpesa/b2c-callback`,
    };

    const response = await fetch(
      `${this.getBaseUrl()}/mpesa/b2c/v1/paymentrequest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error(`B2C failed: ${response.statusText}`);
    }

    return await response.json();
  }
}
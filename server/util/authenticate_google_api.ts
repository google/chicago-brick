import {
  CredentialsClient,
  JWTInput,
} from "https://googleapis.deno.dev/_/base@v1/auth/mod.ts";
import * as jose from "https://deno.land/x/jose@v4.11.1/index.ts";
import { easyLog } from "../../lib/log.ts";

const log = easyLog("slideshow:google_auth");

export class GoogleAuth implements CredentialsClient {
  requestedScopes: string[] = [];
  accessToken = "";
  inflightRefresh: Promise<void> | undefined = undefined;
  expiryDate = 0;

  newTokenRequested: () => void = () => {};
  newTokenPromise = new Promise<void>((resolve) => {
    this.newTokenRequested = resolve;
  });

  constructor(readonly creds: JWTInput) {}
  async getRequestHeaders(
    _url?: string | undefined,
  ): Promise<Record<string, string>> {
    if (Date.now() > this.expiryDate * 1000 || !this.accessToken) {
      if (!this.inflightRefresh) {
        this.inflightRefresh = this.refreshToken();
      }
      await this.inflightRefresh;
      this.inflightRefresh = undefined;
    }
    return { "Authorization": `Bearer ${this.accessToken}` };
  }

  setScopes(scopes: string[]) {
    let dirty = false;
    for (const scope of scopes) {
      if (this.requestedScopes.includes(scope)) {
        continue;
      }
      this.requestedScopes.push(scope);
      dirty = true;
    }
    if (dirty) {
      log("Updated scopes to", this.requestedScopes);
      this.accessToken = "";
    }
  }

  async refreshToken() {
    if (!this.creds.client_email) {
      throw new Error(`client_email needs to be set in google creds`);
    }

    log("Refreshing access token...");
    const iat = Math.floor(new Date().getTime() / 1000);
    this.expiryDate = iat + 3600;
    const payload: jose.JWTPayload = {
      iss: this.creds.client_email,
      scope: this.requestedScopes.join(" "),
      aud: "https://oauth2.googleapis.com/token",
      exp: this.expiryDate,
      iat,
    };
    const key = await jose.importPKCS8(this.creds.private_key!, "RS256");
    const signedJWT = await new jose.SignJWT(payload)
      .setProtectedHeader({
        alg: "RS256",
        "typ": "JWT",
      })
      .sign(key);

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signedJWT,
      }),
      headers: new Headers({
        "Content-Type": "application/x-www-form-urlencoded",
      }),
    });
    if (!res.ok) {
      throw new Error(`Auth res not okay: ${res.statusText}`);
    }
    const creds = await res.json();
    log("Access token refreshed.");
    this.accessToken = creds.access_token;
    this.newTokenRequested();
    this.newTokenPromise = new Promise<void>((resolve) => {
      this.newTokenRequested = resolve;
    });
  }

  tokenIterator(): AsyncIterable<Record<string, string>> {
    return {
      [Symbol.asyncIterator]: () => {
        return {
          next: async () => {
            await this.newTokenPromise;
            const headers = await this.getRequestHeaders();
            return {
              done: false,
              value: headers,
            };
          },
        };
      },
    };
  }
}

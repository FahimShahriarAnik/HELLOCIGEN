import { OpenAI } from 'openai';
import * as vscode from 'vscode';

export type AiProviderType = 'openai' | 'gemini';

interface ProviderConfig {
  baseURL?: string;
  model: string;
  secretKey: string;
  displayName: string;
  envVar: string;
}

const PROVIDERS: Record<AiProviderType, ProviderConfig> = {
  openai: {
    model: 'gpt-4',
    secretKey: 'openai-api-key',
    displayName: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.0-flash',
    secretKey: 'gemini-api-key',
    displayName: 'Google Gemini',
    envVar: 'GEMINI_API_KEY',
  },
};

export function getActiveProvider(): AiProviderType {
  const config = vscode.workspace.getConfiguration('helloCigen');
  const provider = config.get<string>('aiProvider', 'gemini');
  return provider === 'openai' ? 'openai' : 'gemini';
}

export function getProviderConfig(provider?: AiProviderType): ProviderConfig {
  return PROVIDERS[provider ?? getActiveProvider()];
}

export function getSecretKeyName(provider?: AiProviderType): string {
  return getProviderConfig(provider).secretKey;
}

export function getEnvVarName(provider?: AiProviderType): string {
  return getProviderConfig(provider).envVar;
}

export function createAiClient(apiKey: string, provider?: AiProviderType): { client: OpenAI; model: string } {
  const config = getProviderConfig(provider);
  const client = new OpenAI({
    apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  });
  return { client, model: config.model };
}

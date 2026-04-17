// Typed accessors for edge-function secrets. Centralized so every function
// fails the same way when a required secret is missing — caller just sees
// `MissingEnvError: CF_AI_TOKEN`, not a null deref deep in some fetch call.

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`missing required env var: ${name}`);
    this.name = 'MissingEnvError';
  }
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new MissingEnvError(name);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name);
}

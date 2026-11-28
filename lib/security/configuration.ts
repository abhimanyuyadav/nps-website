const PLACEHOLDER_VALUE = /replace|your[_-]|example/i;

export function isConfiguredSecret(value: string | undefined): value is string {
  return Boolean(value && value.trim().length >= 32 && !PLACEHOLDER_VALUE.test(value));
}

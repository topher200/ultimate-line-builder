export function newId(): string {
  return crypto.randomUUID();
}

const DEVICE_KEY = 'ulb:deviceId';

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

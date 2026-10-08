// The photo just taken, carried from the camera to the "reading your photo" screen in this tab only (DECISIONS
// D-077). It never goes back to the server: the server keeps the sharp photo behind the report link (D-031), and
// this is the client's own picture, already on their screen a moment ago. It's dropped when the gate opens, and
// sessionStorage clears with the tab. Private mode or a full store simply means the scan shows without the photo.

export interface Shot {
  /** The photo as a data URL. */
  photo: string;
  /** The face model's points on it, 0 to 1 each way. */
  points: [number, number][];
}

const key = (scanId: string) => `rebloom:shot:${scanId}`;

export async function stashShot(scanId: string, blob: Blob, points: [number, number][]): Promise<void> {
  try {
    const photo = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    window.sessionStorage.setItem(key(scanId), JSON.stringify({ photo, points } satisfies Shot));
  } catch {
    // No room, or no storage: the scan screen shows the face model instead.
  }
}

export function readShot(scanId: string): Shot | null {
  try {
    const raw = window.sessionStorage.getItem(key(scanId));
    const shot = raw ? (JSON.parse(raw) as Shot) : null;
    return shot && typeof shot.photo === "string" && Array.isArray(shot.points) ? shot : null;
  } catch {
    return null;
  }
}

export function dropShot(scanId: string): void {
  try {
    window.sessionStorage.removeItem(key(scanId));
  } catch {
    // Nothing to drop.
  }
}

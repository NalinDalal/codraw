"use client";

import { HTTP_BACKEND } from "@/config";
import { Button } from "@repo/ui/button";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import axios, { isAxiosError } from "axios";
import { useState } from "react";

/**
 * Button that creates a new room and navigates to the canvas.
 *
 * On click, sends a POST request to create a room via the HTTP backend.
 * If the user is unauthenticated (401/403), redirects to `/signin`.
 * On success, navigates to `/canvas/{slug}`.
 * On other errors, displays an inline error message.
 */
export function OpenCanvasButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a room via the HTTP backend and navigate to the canvas page.
   *
   * @returns {Promise<void>}
   * @throws Does not throw — errors are caught and displayed inline or via redirect.
   */
  async function handleClick() {
    setError(null);
    try {
      const res = await axios.post(
        `${HTTP_BACKEND}/room`,
        { name: `room-${Date.now()}` },
        { withCredentials: true },
      );
      router.push(`/canvas/${res.data.slug}`);
    } catch (e) {
      if (isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403)) {
        router.push("/signin");
      } else {
        setError("Failed to create room. Please try again.");
      }
    }
  }

  return (
    <div>
      <Button
        size="lg"
        variant="secondary"
        className="px-6 h-12"
        onClick={handleClick}
      >
        Open Canvas
        <Pencil className="ml-2 w-4 h-4" />
      </Button>
      {error && <p className="text-sm text-danger dark:text-danger-dark mt-2">{error}</p>}
    </div>
  );
}

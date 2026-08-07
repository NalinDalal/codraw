"use client";

import { HTTP_BACKEND } from "@/config";
import { Button } from "@repo/ui/button";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import axios, { isAxiosError } from "axios";
import { useState } from "react";

/**
 * Button that creates a new room and navigates to the canvas.
 * Redirects to sign-in if the user is not authenticated.
 */
export function OpenCanvasButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  /** Create a room via the HTTP backend and navigate to the canvas page */
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
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

export default function ProfilePage() {
  // Clerk's copy of the user. We use it for the profile picture.
  const { isLoaded, user: clerkUser } = useUser();

  // Form values
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Page status
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null); // { type: "success" | "error", text }

  // Load the saved profile from our database when the page opens
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/users/me");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setName(data.user.name ?? "");
        setPhone(data.user.phone ?? "");
        setEmail(data.user.email ?? "");
      } catch (err) {
        setMessage({ type: "error", text: err.message });
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  // Runs when the Save button is clicked
  async function handleSave(e) {
    e.preventDefault(); // stop the browser from reloading the page
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // The server also changed the name in Clerk, so refresh Clerk's copy
      await clerkUser.reload();
      setMessage({ type: "success", text: "Profile updated." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // Runs when a picture is chosen
  async function handlePictureChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Check the file before uploading
    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please choose an image file." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "Image must be smaller than 5 MB." });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      // Send the image straight to Clerk
      await clerkUser.setProfileImage({ file });
      setMessage({ type: "success", text: "Profile picture updated." });
    } catch (err) {
      setMessage({ type: "error", text: "Could not upload the picture. Try again." });
    } finally {
      setUploading(false);
      e.target.value = ""; // allow choosing the same file again later
    }
  }

  if (loading || !isLoaded) return <p>Loading...</p>;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Your profile</h1>

      {/* Success or error message */}
      {message && (
        <p
          className={`rounded p-3 text-sm ${
            message.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Profile picture */}
      <div className="flex items-center gap-4 rounded-lg bg-white p-4 shadow">
        <img
          src={clerkUser.imageUrl}
          alt="Profile"
          className="h-20 w-20 rounded-full object-cover"
        />
        <div>
          <label className="cursor-pointer rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
            {uploading ? "Uploading..." : "Change picture"}
            <input
              type="file"
              accept="image/*"
              onChange={handlePictureChange}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <p className="mt-2 text-xs text-gray-500">JPG or PNG, up to 5 MB</p>
        </div>
      </div>

      {/* Details form */}
      <form onSubmit={handleSave} className="space-y-4 rounded-lg bg-white p-4 shadow">
        <div>
          <label className="mb-1 block text-sm font-medium">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full rounded border border-gray-200 bg-gray-100 px-3 py-2 text-gray-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Email is managed by your login and can't be changed here.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-black px-5 py-2 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}
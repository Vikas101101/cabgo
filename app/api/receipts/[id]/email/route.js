import { getCurrentUser } from "@/lib/getCurrentUser";
import { sendReceiptEmail, maskEmail } from "@/lib/receiptEmail";

// POST /api/receipts/<ride id>/email → email the receipt to the logged-in rider
export async function POST(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    const { id } = await params;
    const result = await sendReceiptEmail({ rider: user, rideId: id, manual: true });

    if (!result.ok) {
      return Response.json({ error: result.message }, { status: result.status });
    }

    // The email always goes to the address on the account, never to one from the browser.
    // We show it partly hidden.
    return Response.json({ sent: true, to: maskEmail(result.to) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
import { getCurrentUser } from "@/lib/getCurrentUser";
import { loadReceipt } from "@/lib/receipt";

// GET /api/receipts/<ride id> → the receipt for one paid ride
export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    const { id } = await params;
    const result = await loadReceipt(user, id);

    if (result.error) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({ receipt: result.receipt });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
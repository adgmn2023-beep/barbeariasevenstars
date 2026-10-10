import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { bookingSchema, readableError } from "@/lib/validation";
import { createBooking } from "@/lib/booking-server";
export async function POST(request: Request) {
  try {
    const input = bookingSchema.parse(await request.json());
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Entre na sua conta para agendar." },
        { status: 401 },
      );
    const result = await createBooking(db, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: readableError(error) }, { status: 400 });
  }
}

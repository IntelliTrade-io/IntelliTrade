// app/api/newsletter/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    const formData = new URLSearchParams({
      EMAIL: email,
      email_address_check: "", // honeypot
      locale: "en",
    });

    const response = await fetch(
      "https://e2c25aa6.sibforms.com/serve/MUIFAG_OYAHrqC4-s-344lPokNpv22D0uyD-cRSZWvWpHs9AlNt2jnByYLR9xKHZX8CNEo0NSotqGM070K0DO06IeOF0sQQ9GZ0k8J_3OKj7bzSjrS8gb76eTv28q8HvOJLUCfBMqCkTvGCqiajoHZDMFIc47hm8IsAjAl47Tp-a_RG1jY7HIyoEcYPdtE9BvAxSnx3ReTrAxM9i",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      }
    );

    if (!response.ok) throw new Error("Form submission failed");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: requesterProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["dealer", "admin"].includes(requesterProfile?.role)) {
    return NextResponse.json({ error: "Only dealer accounts can create new accounts." }, { status: 403 });
  }

  const { fullName, email, password, role, branchId, newBranchName, newBranchAbbreviation } = await request.json();

  if (!fullName || !email || !password || !role) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!["sub_dealer", "dealer", "parts_team", "technical_team"].includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (role === "sub_dealer" && newBranchName && (!newBranchAbbreviation || newBranchAbbreviation.length !== 3)) {
    return NextResponse.json({ error: "A 3-letter branch abbreviation is required for a new branch." }, { status: 400 });
  }

  const admin = createAdminClient();

  let finalBranchId = null;
  if (role === "sub_dealer") {
    if (newBranchName) {
      const { data: branch, error: branchError } = await admin
        .from("branches")
        .insert({ name: newBranchName, abbreviation: newBranchAbbreviation })
        .select()
        .single();
      if (branchError) return NextResponse.json({ error: branchError.message }, { status: 400 });
      finalBranchId = branch.id;
    } else if (branchId) {
      finalBranchId = branchId;
    } else {
      return NextResponse.json({ error: "A branch is required for sub-dealer accounts." }, { status: 400 });
    }
  }

  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: newUser.user.id,
    full_name: fullName,
    role,
    branch_id: finalBranchId,
  });
  if (profileError) {
    // Roll back the auth user so we don't leave an orphaned login with no profile
    await admin.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, userId: newUser.user.id });
}

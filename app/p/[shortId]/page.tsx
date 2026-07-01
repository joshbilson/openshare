import { Recipient } from "@/components/Recipient";

export default async function RecipientPage({
  params,
}: {
  params: Promise<{ shortId: string }>;
}) {
  const { shortId } = await params;
  return <Recipient shortId={shortId} />;
}

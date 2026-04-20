import { z } from "zod";

const cubepanionBaseUrl = "https://cubepanion.ameliah.art/api/v2";

const GameSchema = z.object({
  id: z.number(),
  name: z.string(),
  displayName: z.string(),
  aliases: z.array(z.string()),
  active: z.boolean(),
  scoreType: z.string(),
  shouldTrack: z.boolean(),
  hasPreLobby: z.boolean(),
});

export type Game = z.infer<typeof GameSchema>;

export async function fetchGames(): Promise<Game[]> {
  const res = await fetch(`${cubepanionBaseUrl}/Games`);
  const json = await res.json();
  const parsed = z.array(GameSchema).safeParse(json);
  if (!parsed.success) {
    console.error("Invalid response from Cubepanion Games API:", parsed.error);
    return [];
  }
  return parsed.data;
}

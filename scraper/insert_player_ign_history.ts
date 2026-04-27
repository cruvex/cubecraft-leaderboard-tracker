import { v7 as uuidv7 } from "uuid@14.0.0";

// Your input JSON
const data = [
  { "uuid": "adfe551a-d4e5-44ae-800a-5c3aa431e2d8", "ign": "ILoveYouKeitty", "timestamp": "2026-04-09T20:24:46Z" },
  { "uuid": "adfe551a-d4e5-44ae-800a-5c3aa431e2d8", "ign": "yavs", "timestamp": "2023-11-29T18:21:52Z" }
];

// Helper to generate UUIDv7 from a timestamp
function uuidv7FromDate(date: Date): string {
  return uuidv7({ msecs: date.getTime() });
}

const values = data.map((entry) => {
  const date = new Date(entry.timestamp);
  const id = uuidv7FromDate(date);

  return `('${id}', '${entry.uuid}', '${entry.ign}')`;
});

const sql = `
INSERT INTO ign_history (id, player_uuid, player_ign)
VALUES
${values.join(",\n")};
`;

console.log(sql);

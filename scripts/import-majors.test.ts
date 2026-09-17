import { describe, expect, it } from "vitest";
import { renderedPlacementMap } from "./import-majors";

const PRIZE_TABLE = `
<table class="prizepooltable prizepooltable-placement">
<tr class="head"><th>Place</th><th>Team</th></tr>
<tr>
  <td class="prizepooltable-place" rowspan="1"><span class="prizepooltable-badge">1</span></td>
  <td><span class="name"><a>Fnatic</a></span></td>
</tr>
<tr>
  <td class="prizepooltable-place"><span class="prizepooltable-badge">2</span></td>
  <td><span class="name"><a>Ninjas in Pyjamas</a></span></td>
</tr>
<tr>
  <td class="prizepooltable-place" rowspan="2"><span class="prizepooltable-badge">3&#45;4</span></td>
  <td><span class="name"><a>VeryGames</a></span></td>
</tr>
<tr>
  <td><span class="name"><a>compLexity Gaming</a></span></td>
</tr>
<tr>
  <td class="prizepooltable-place" rowspan="4">5&#45;8</td>
  <td><span class="name"><a>LGB eSports</a></span></td>
</tr>
<tr>
  <td><span class="name"><a>Copenhagen Wolves</a></span></td>
</tr>
<tr>
  <td><span class="name"><a>Recursive eSports</a></span></td>
</tr>
<tr>
  <td><span class="name"><a>Astana Dragons</a></span></td>
</tr>
<tr>
  <td class="prizepooltable-place" rowspan="4">13&#45;16</td>
  <td><span class="name"><a>Natus Vincere</a></span></td>
</tr>
<tr>
  <td><span class="name"><a>3DMAX</a></span></td>
</tr>
</table>
`;

describe("renderedPlacementMap", () => {
	it("reads tied ranges from place cells, not only medal badges", () => {
		const placements = renderedPlacementMap(PRIZE_TABLE);
		expect(placements.get("fnatic")).toBe(1);
		expect(placements.get("ninjas-in-pyjamas")).toBe(2);
		expect(placements.get("verygames")).toBe(3);
		expect(placements.get("complexity-gaming")).toBe(3);
		expect(placements.get("lgb-esports")).toBe(5);
		expect(placements.get("copenhagen-wolves")).toBe(5);
		expect(placements.get("natus-vincere")).toBe(13);
		expect(placements.get("navi")).toBe(13);
		expect(placements.get("3dmax")).toBe(13);
	});
});

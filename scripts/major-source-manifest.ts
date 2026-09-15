export type MajorSource = {
	id: string;
	page: string;
};

export const MAJOR_SOURCES: readonly MajorSource[] = [
	{ id: "dreamhack-winter-2013", page: "DreamHack/2013/Winter" },
	{ id: "ems-one-katowice-2014", page: "ESL/Major Series One/2014/Katowice" },
	{ id: "esl-one-cologne-2014", page: "ESL/One/2014/Cologne" },
	{ id: "dreamhack-winter-2014", page: "DreamHack/2014/Winter" },
	{ id: "esl-one-katowice-2015", page: "ESL/One/2015/Katowice" },
	{ id: "esl-one-cologne-2015", page: "ESL/One/2015/Cologne" },
	{ id: "dreamhack-cluj-napoca-2015", page: "DreamHack/2015/Cluj-Napoca" },
	{ id: "mlg-columbus-2016", page: "MLG/2016/Columbus" },
	{ id: "esl-one-cologne-2016", page: "ESL/One/2016/Cologne" },
	{ id: "eleague-atlanta-2017", page: "ELEAGUE/2017/Major" },
	{ id: "pgl-krakow-2017", page: "PGL/2017/Krakow" },
	{ id: "eleague-boston-2018", page: "ELEAGUE/2018/Major" },
	{ id: "faceit-london-2018", page: "FACEIT/2018/Major" },
	{ id: "iem-katowice-2019", page: "Intel Extreme Masters/Season XIII/World Championship" },
	{ id: "starladder-berlin-2019", page: "StarLadder/2019/Major" },
	{ id: "pgl-stockholm-2021", page: "PGL/2021/Stockholm" },
	{ id: "pgl-antwerp-2022", page: "PGL/2022/Antwerp" },
	{ id: "iem-rio-2022", page: "Intel Extreme Masters/2022/Rio" },
	{ id: "blast-paris-2023", page: "BLAST/Major/2023/Paris" },
	{ id: "pgl-copenhagen-2024", page: "PGL/2024/Copenhagen" },
	{ id: "perfect-world-shanghai-2024", page: "Perfect World/Major/2024/Shanghai" },
	{ id: "blast-austin-2025", page: "BLAST/Major/2025/Austin" },
	{ id: "starladder-budapest-2025", page: "StarLadder/2025/Major" },
	{ id: "iem-cologne-2026", page: "Intel Extreme Masters/2026/Cologne" },
] as const;

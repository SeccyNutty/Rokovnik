// Prije svakog pokretanja e2e testova briše testnu bazu, da testovi uvijek kreću od praznog sustava.
import { rmSync } from "node:fs";
rmSync(new URL("../.data/e2e", import.meta.url), { recursive: true, force: true });

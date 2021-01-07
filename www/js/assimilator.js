/*
    Star Trek Timelines Assimilate This (STTAT)
    Copyright (c) 2021 USS John Jay

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/*jshint esversion: 6 */

class Assimilator {
	constructor(config) {
		this.config = config;

		this.meta = false;

		// Stripped down, but mostly equivalent versions of player data
		this.crew = [];			// player.crew
		this.ships = [];		// player.ships
		this.voyage = false;	// player.character.voyage_descriptions[0]

		// Other useful player data, simplified with no easy equivalent
		this.buffs = false;
		this.crewtraits = [];
		this.weekend = false;
	}

	sendProgress(message) {
		if (this.config.progressCallback)
			this.config.progressCallback(message);
	}

	parse(rawtext, source) {
		let assimilated = false;
		let player = false;

		let iError = 0;
		if (rawtext == "") {
			iError = 1;
		}
		else {
			try {
				let _playerData = JSON.parse(rawtext);
				player = _playerData.player;
			}
			catch (e) {
				iError = 2;
			}

			if (player && !player.character) {
				iError = 3;
			}

			if (iError == 0) {
				this.importBuffs(player.character);
				this.importCrew(player.character);
				this.importShips(player.character);
				this.importVoyage(player.character);
				this.importWeekend(player.character);	// Events
				this.defaultVoyageExcludes();

				let meta = {
					'source': source,
					'update_time': Date.now(),
					'dispatcher': this.config.dispatcher,
					'dispatcher_version': this.config.dispatcherVersion
				};
				assimilated = {
					'meta': meta,
					'buffs': this.buffs,
					'crew': this.crew,
					'crewtraits': this.crewtraits,
					'ships': this.ships,
					'voyage': this.voyage,
					'weekend': this.weekend
				};
				this.sendProgress("Rosters successfully imported!");
			}
		}

		player = null;

		if (iError == 0)
			this.config.successCallback(assimilated);
		else {
			let error = "";
			switch (iError) {
				case 1:
					error = "There is no data to import.";
					break;
				case 2:
					error = "The text inputted is not valid player data.";
					break;
				case 3:
					error = "There is no character data available.";
					break;
			}
			this.config.errorCallback(error);
		}
	}

	importBuffs(playerData) {
		this.sendProgress("Importing buffs...");

		let buffs = {
			'command': {'core': 0, 'range_min': 0, 'range_max': 0},
			'diplomacy': {'core': 0, 'range_min': 0, 'range_max': 0},
			'security': {'core': 0, 'range_min': 0, 'range_max': 0},
			'engineering': {'core': 0, 'range_min': 0, 'range_max': 0},
			'science': {'core': 0, 'range_min': 0, 'range_max': 0},
			'medicine': {'core': 0, 'range_min': 0, 'range_max': 0}
		};
		if ('all_buffs' in playerData) {
			let allBuffs = playerData.all_buffs;
			for (let i = 0; i < allBuffs.length; i++) {
				let stat = allBuffs[i].stat.split("_");
				let skillId = stat[0];
				let buffId = stat[2] == "range" ? stat[2]+"_"+stat[3] : stat[2];
				if (buffId == "core" || buffId == "range_min" || buffId == "range_max")
					buffs[skillId][buffId] = allBuffs[i].value;
			}
		}
		this.buffs = buffs;
	}

	importCrew(playerData) {
		if (!playerData.crew) return;

		this.sendProgress("Importing crew...");

		let crewData = playerData.crew;

		let crew = [];
		let crewCountsBySymbol = {};

		let crewId = 0;
		for (let i = 0; i < crewData.length; i++) {
			if (crewData[i].in_buy_back_state) continue;

			for (let trait in crewData[i].traits) {
				if (crewData[i].traits.hasOwnProperty(trait)) {
					this.getTraitId(crewData[i].traits[trait]);
				}
			}
			let variants = [];
			for (let trait in crewData[i].traits_hidden) {
				if (crewData[i].traits_hidden.hasOwnProperty(trait)) {
					this.getTraitId(crewData[i].traits_hidden[trait], true);
					if (this.isVariantTrait(crewData[i].traits_hidden[trait]))
						variants.push(crewData[i].traits_hidden[trait]);
				}
			}

			let iCopy = 1;
			if (crewData[i].symbol in crewCountsBySymbol)
				iCopy = ++crewCountsBySymbol[crewData[i].symbol];
			else
				crewCountsBySymbol[crewData[i].symbol] = 1;

			let bImmortal = crewData[i].level == crewData[i].max_level
							&& crewData[i].rarity == crewData[i].max_rarity
							&& crewData[i].equipment_slots.length == crewData[i].equipment.length;

			let bFrozen = false;

			let crewman = {
				'id': crewId,
				'symbol': crewData[i].symbol,
				'name': crewData[i].name,
				'short_name': crewData[i].short_name,
				'archetype_id': crewData[i].archetype_id,
				'level': crewData[i].level,
				'rarity': crewData[i].rarity,
				'max_rarity': crewData[i].max_rarity,
				'active_status': crewData[i].active_status,
				'traits': crewData[i].traits,
				'traits_hidden': crewData[i].traits_hidden,
				'skills': crewData[i].skills,
				'_variants': variants,
				'_copy': iCopy,
				'_immortal': bImmortal,
				'_frozen': bFrozen
			};
			crew.push(crewman);
			crewId++;
		}
		this.crew = crew;
	}

	importShips(playerData) {
		if (!playerData.ships) return;

		this.sendProgress("Importing ships...");

		let shipData = playerData.ships;

		let ships = [];
		for (let i = 0; i < shipData.length; i++) {
			let ship = {
				'id': i,
				'name': shipData[i].name,
				'rarity': shipData[i].rarity,
				'level': shipData[i].level,
				'max_level': shipData[i].max_level,
				'antimatter': shipData[i].antimatter,
				'traits': shipData[i].traits,
				'_immortal': shipData[i].level == shipData[i].max_level
			};
			ships.push(ship);
		}
		this.ships = ships;
	}

	importVoyage(playerData) {
		if (!playerData.voyage_descriptions) return;

		this.sendProgress("Importing voyage...");

		let description = playerData.voyage_descriptions[0];

		let slots = [];
		for (let slot in description.crew_slots) {
			slots.push({'trait': description.crew_slots[slot].trait});
		}

		let voyageData = {
			'skills': {
				'primary_skill': description.skills.primary_skill,
				'secondary_skill': description.skills.secondary_skill
			},
			'ship_trait': description.ship_trait,
			'crew_slots': slots,
			'_default_excludes': []
		};

		this.voyage = voyageData;
	}

	importWeekend(playerData) {
		this.sendProgress("Importing events...");

		let eventData = false;
		if (playerData.events && playerData.events.length > 0) {
			let activeEvent = playerData.events[0];
			eventData = {
				'id': activeEvent.id,
				'name': activeEvent.name,
				'types': [],
				'crew': [],
				'exclusive': false
			};
			if ('content' in activeEvent) {
				let eventTypes = [];
				let eventCrew = [];

				// Faction
				if ('shuttles' in activeEvent.content) {
					eventTypes.push('faction');
					eventData.exclusive = true;	// Exclude shuttle eligible event crew from voyage recommendations
					let shuttles = activeEvent.content.shuttles;
					for (let i = 0; i < shuttles.length; i++) {
						for (let symbol in shuttles[i].crew_bonuses) {
							if (shuttles[i].crew_bonuses.hasOwnProperty(symbol)) {
								let bonusCrew = this.crew.find(crewman => crewman.symbol == symbol);
								if (bonusCrew) {
									let bonusType = shuttles[i].crew_bonuses[symbol]; // 2 or 3 (featured)
									eventCrew.push({'id': bonusCrew.id, 'type': bonusType});
								}
							}
						}
					}
				}

				// Galaxy
				if ('crew_bonuses' in activeEvent.content) {
					eventTypes.push('galaxy');
					eventData.exclusive = true; // Exclude galaxy eligible event crew from voyage recommendations
					for (let symbol in activeEvent.content.crew_bonuses) {
						if (activeEvent.content.crew_bonuses.hasOwnProperty(symbol)) {
							let bonusCrew = this.crew.find(crewman => crewman.symbol == symbol);
							if (bonusCrew) {
								let bonusType = activeEvent.content.crew_bonuses[symbol]; // 2 or 3 (featured)
								eventCrew.push({'id': bonusCrew.id, 'type': bonusType});
							}
						}
					}
				}

				// Skirmish
				if ('bonus_crew' in activeEvent.content) {
					eventTypes.push('skirmish');
					for (let i = 0; i < activeEvent.content.bonus_crew.length; i++) {
						let symbol = activeEvent.content.bonus_crew[i];
						let bonusCrew = this.crew.find(crewman => crewman.symbol == symbol);
						if (bonusCrew) {
							eventCrew.push({'id': bonusCrew.id, 'type': 3});	// bonusType = 3?
						}
					}
					// Skirmish also uses 'bonus_traits' in activeEvent.content // bonusType = 2?
				}

				eventData.types = eventTypes;
				eventData.crew = eventCrew;
			}
		}
		this.weekend = eventData;
	}

	defaultVoyageExcludes() {
		if (!this.voyage || !this.weekend)
			return;

		let excludes = [];
		for (let i = 0; i < this.crew.length; i++) {
			// 2: Active on shuttles
			// 3: Active on voyagers (can't send more than 1 voyage at a time, so ignore these)
			if (this.crew[i].active == 2) excludes.push(this.crew[i].id);
		}
		if (this.weekend && this.weekend.exclusive) {
			for (let i = 0; i < this.weekend.crew.length; i++) {
				if (excludes.indexOf(this.weekend.crew[i].id) == -1)
					excludes.push(this.weekend.crew[i].id);
			}
		}
		this.voyage._default_excludes = excludes;
	}

	getTraitId(traitname, bHidden = false) {
		let traitId = -1;
		let existing = this.crewtraits.find(trait => trait.name == traitname);
		if (existing) {
			traitId = existing.id;
		}
		else {
			traitId = this.crewtraits.length;
			this.crewtraits.push({
				'id': traitId,
				'name': traitname,
				'hidden': bHidden
			});
		}
		return traitId;
	}

	isVariantTrait(traitname) {
		let bVariant = true;
		switch (traitname)
		{
			case "tos":
			case "tas":
			case "tng":
			case "ds9":
			case "voy":
			case "ent":
			case "dsc":
			case "pic":
			case "nonhuman":
			case "artificial_life":
			case "organic":
			case "species_8472":
			case "female":
			case "male":
			case "admiral":
			case "captain":
			case "commander":
			case "lieutenant_commander":
			case "lieutenant":
			case "ensign":
			case "general":
			case "nagus":
			case "first_officer":
			case "bridge_crew":
			case "ageofsail":
			case "evsuit":
			case "mirror":
			case "niners":
			case "original":
			case "gauntlet_jackpot":
			case "crew_max_rarity_5":
			case "crew_max_rarity_4":
			case "crew_max_rarity_3":
			case "crew_max_rarity_2":
			case "crew_max_rarity_1":
				bVariant = false;
				break;
		}
		return bVariant;
	}
}

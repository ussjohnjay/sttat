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
	constructor(config, sttat = false) {
		this.config = config;
		this.sttat = sttat;
	}

	sendProgress(message) {
		if (this.config.progressCallback)
			this.config.progressCallback(message);
	}

	parse(rawtext) {
		let self = this;
		return new Promise(function(resolve, reject) {
			let json = false;

			if (rawtext == "")
				reject("There is no data to import.");

			try {
				json = JSON.parse(rawtext);
			}
			catch (e) {
				reject("The text inputted is not valid data.");
			}

			// Player Data
			if (json.player) {
				let importer = new AssimilatorPlayer(self.config);
				importer.read(json.player)
					.then((imported) => {
						self.sendProgress("Rosters successfully imported!");
						imported.meta =  {
							'import_date': Date.now(),
							'datacore_date': false,
							'dispatcher': self.config.dispatcher,
							'dispatcher_version': self.config.dispatcherVersion
						};
						resolve({'type': 'player', 'data': imported});
					})
					.catch((error) => {
						reject(error);
					});
			}
			// DataCore Data
			else if (self.sttat) {
				if (!self.sttat.meta.datacore_date) {
					let merger = new AssimilatorDC(self.config);
					merger.merge(self.sttat, json)
						.then((merged) => {
							merged.meta.datacore_date = Date.now();
							resolve({'type': 'datacore', 'data': merged});
						})
						.catch((error) => {
							reject(error);
						});
				}
				else {
					reject("DataCore data already found.");
				}
			}
			else {
				reject("Can't identify data.");
			}

			json = null;
		});
	}
}


class AssimilatorPlayer {
	constructor(config) {
		this.config = config;

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

	read(player) {
		let self = this;
		return new Promise(function(resolve, reject) {
			let assimilated = false;

			if (!player.character)
				reject("There is no character data available.");

			self.importBuffs(player.character);
			self.importCrew(player.character);
			self.importShips(player.character);
			self.importVoyage(player.character);
			self.importWeekend(player.character);	// Events

			self.stored_immortals = JSON.parse(JSON.stringify(player.character.stored_immortals));

			player = null;

			assimilated = {
				'buffs': self.buffs,
				'crew': self.crew,
				'crewtraits': self.crewtraits,
				'ships': self.ships,
				'voyage': self.voyage,
				'weekend': self.weekend,
				'stored_immortals': self.stored_immortals
			};
			self.sendProgress("Rosters successfully imported!");
			resolve(assimilated);
		});
	}

	importBuffs(playerData) {
		this.sendProgress("Importing buffs...");

		let buffs = {
			'command_skill': {'core': 0, 'range_min': 0, 'range_max': 0},
			'diplomacy_skill': {'core': 0, 'range_min': 0, 'range_max': 0},
			'security_skill': {'core': 0, 'range_min': 0, 'range_max': 0},
			'engineering_skill': {'core': 0, 'range_min': 0, 'range_max': 0},
			'science_skill': {'core': 0, 'range_min': 0, 'range_max': 0},
			'medicine_skill': {'core': 0, 'range_min': 0, 'range_max': 0}
		};
		if ('all_buffs' in playerData) {
			let allBuffs = playerData.all_buffs;
			for (let i = 0; i < allBuffs.length; i++) {
				let stat = allBuffs[i].stat.split("_");
				let skillId = stat[0]+"_"+stat[1];
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

			let iCopy = 1;
			if (crewData[i].symbol in crewCountsBySymbol)
				iCopy = ++crewCountsBySymbol[crewData[i].symbol];
			else
				crewCountsBySymbol[crewData[i].symbol] = 1;

			let bImmortal = crewData[i].level == crewData[i].max_level
							&& crewData[i].rarity == crewData[i].max_rarity
							&& crewData[i].equipment_slots.length == crewData[i].equipment.length;

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
				'copy': iCopy,
				'immortal': bImmortal,
				'frozen': false
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
				'immortal': shipData[i].level == shipData[i].max_level
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
			'crew_slots': slots
		};

		this.voyage = voyageData;
	}

	importWeekend(playerData) {
		this.sendProgress("Importing events...");

		let eventData = false;
		if (playerData.events && playerData.events.length > 0) {
			let activeEvent = playerData.events
				.filter((ev) => (ev.seconds_to_end > 0))
				.sort((a, b) => (a.seconds_to_start - b.seconds_to_start))
			[0];
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
								if (!eventCrew.find(crewman => crewman.symbol == symbol)) {
									let bonusType = shuttles[i].crew_bonuses[symbol]; // 2 or 3 (featured)
									eventCrew.push({'symbol': symbol, 'type': bonusType});
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
							if (!eventCrew.find(crewman => crewman.symbol == symbol)) {
								let bonusType = activeEvent.content.crew_bonuses[symbol]; // 2 or 3 (featured)
								eventCrew.push({'symbol': symbol, 'type': bonusType});
							}
						}
					}
				}

				// Skirmish
				if ('bonus_crew' in activeEvent.content) {
					eventTypes.push('skirmish');
					for (let i = 0; i < activeEvent.content.bonus_crew.length; i++) {
						let symbol = activeEvent.content.bonus_crew[i];
						if (!eventCrew.find(crewman => crewman.symbol == symbol)) {
							eventCrew.push({'symbol': symbol, 'type': 3});	// bonusType = 3?
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
}

class AssimilatorDC {
	constructor(config) {
		this.config = config;
	}

	sendProgress(message) {
		if (this.config.progressCallback)
			this.config.progressCallback(message);
	}

	merge(sttat, datacore) {
		let self = this;
		return new Promise(function(resolve, reject) {
			let allcrew = self.streamline(datacore, sttat.buffs);  
			let crewlist = JSON.parse(JSON.stringify(sttat.crew));
			let fakeId = sttat.crew.length;
			sttat.stored_immortals.forEach(frozen => {
				let immortal = allcrew.find(ac => ac.archetype_id == frozen.id);
				if (immortal) {
					let copies = crewlist.filter(mc => mc.symbol == immortal.symbol);
					let iCopy = copies.length;
					for (let i = 0; i < frozen.quantity; i++) {
						let crewman = {
							'id': fakeId++,
							'symbol': immortal.symbol,
							'name': immortal.name,
							'short_name': immortal.short_name,
							'archetype_id': immortal.archetype_id,
							'level': 100,
							'rarity': immortal.max_rarity,
							'max_rarity': immortal.max_rarity,
							'active_status': 0,
							'traits': immortal.traits,
							'traits_hidden': immortal.traits_hidden,
							'skills': immortal.skills,
							'copy': ++iCopy,
							'immortal': true,
							'frozen': true
						};
						crewlist.push(crewman);
					}
				}
			});
			sttat.crew = crewlist;
			sttat.datacore = allcrew;
			self.sendProgress("DataCore successfully imported!");
			resolve(sttat);
		});
	}
	
	streamline(datacore, buffs) {
		let allcrew = [];
		datacore.forEach(dc => {
			let crewman = {
				'symbol': dc.symbol,
				'name': dc.name,
				'short_name': dc.short_name,
				'archetype_id': dc.archetype_id,
				'max_rarity': dc.max_rarity,
				'traits': dc.traits.slice(),
				'traits_hidden': dc.traits_hidden.slice(),
				'skills': this.applyBuffs(dc.base_skills, buffs),
				'in_portal': dc.in_portal
			};
			allcrew.push(crewman);
		});
		return allcrew;
	}	

	applyBuffs(base_skills, buffs) {
		let buffed = {};
		for (let skillId in base_skills) {
			if (base_skills.hasOwnProperty(skillId)) {
				buffed[skillId] = {
					'core': Math.round(base_skills[skillId].core*(1+buffs[skillId].core)),
					'range_min': Math.round(base_skills[skillId].range_min*(1+buffs[skillId].range_min)),
					'range_max': Math.round(base_skills[skillId].range_max*(1+buffs[skillId].range_max))
				};
			}
		}
		return buffed;
	}
}
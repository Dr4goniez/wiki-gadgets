/* eslint-disable @typescript-eslint/no-unused-vars */
const list_logevents_before_multiblocks =
{
	"batchcomplete": true,
	"limits": {
		"logevents": 5000
	},
	"query": {
		"logevents": [
			{
				"logid": 367458,
				"ns": 2,
				"title": "User:ルードヴィッヒ・ヒューイット",
				"pageid": 0,
				"logpage": 0,
				"params": {
					"duration": "infinity",
					"flags": [
						"nocreate",
						"noemail",
						"nousertalk"
					],
					"sitewide": true,
					"duration-l10n": "infinite"
				},
				"type": "block",
				"action": "block",
				"user": "Dragoniez",
				"userid": 52097,
				"timestamp": "2023-11-19T12:02:29Z",
				"comment": "Long-term abuse",
				"parsedcomment": "Long-term abuse",
				"tags": []
			}
		]
	}
};
const list_blocks_before_multiblocks =
{
	"batchcomplete": true,
	"limits": {
		"blocks": 5000
	},
	"query": {
		"blocks": [
			{
				"id": 21300,
				"user": "ルードヴィッヒ・ヒューイット",
				"userid": 59694,
				"by": "Dragoniez",
				"byid": 52097,
				"timestamp": "2023-11-19T12:02:29Z",
				"expiry": "infinity",
				"duration-l10n": "infinite",
				"reason": "Long-term abuse",
				"parsedreason": "Long-term abuse",
				"automatic": false,
				"anononly": false,
				"nocreate": true,
				"autoblock": true,
				"noemail": true,
				"hidden": false,
				"allowusertalk": false,
				"partial": false,
				"restrictions": []
			}
		]
	}
};
const list_logevents_reblocked_after_multiblocks =
{
    "batchcomplete": true,
    "limits": {
        "logevents": 5000
    },
    "query": {
        "logevents": [
            {
                "logid": 433393,
                "ns": 2,
                "title": "User:ルードヴィッヒ・ヒューイット",
                "pageid": 0,
                "logpage": 0,
                "params": {
                    "duration": "infinity",
                    "flags": [
                        "nocreate",
                        "noemail",
                        "nousertalk"
                    ],
                    "blockId": 21300,
                    "sitewide": true,
                    "duration-l10n": "infinite"
                },
                "type": "block",
                "action": "reblock",
                "user": "Dragoniez",
                "userid": 52097,
                "timestamp": "2025-08-22T13:42:27Z",
                "comment": "Long-term abuse: <!-- Overwriting a block log entry created before the rollout of multiblocks for testing purposes -->",
                "parsedcomment": "Long-term abuse: &lt;!-- Overwriting a block log entry created before the rollout of multiblocks for testing purposes --&gt;",
                "tags": []
            },
            {
                "logid": 367458,
                "ns": 2,
                "title": "User:ルードヴィッヒ・ヒューイット",
                "pageid": 0,
                "logpage": 0,
                "params": {
                    "duration": "infinity",
                    "flags": [
                        "nocreate",
                        "noemail",
                        "nousertalk"
                    ],
                    "sitewide": true,
                    "duration-l10n": "infinite"
                },
                "type": "block",
                "action": "block",
                "user": "Dragoniez",
                "userid": 52097,
                "timestamp": "2023-11-19T12:02:29Z",
                "comment": "Long-term abuse",
                "parsedcomment": "Long-term abuse",
                "tags": []
            }
        ]
    }
};
const list_blocks_reblocked_after_multiblocks =
{
    "batchcomplete": true,
    "limits": {
        "blocks": 5000
    },
    "query": {
        "blocks": [
            {
                "id": 21300,
                "user": "ルードヴィッヒ・ヒューイット",
                "userid": 59694,
                "by": "Dragoniez",
                "byid": 52097,
                "timestamp": "2025-08-22T13:42:27Z",
                "expiry": "infinity",
                "duration-l10n": "infinite",
                "reason": "Long-term abuse: <!-- Overwriting a block log entry created before the rollout of multiblocks for testing purposes -->",
                "parsedreason": "Long-term abuse: &lt;!-- Overwriting a block log entry created before the rollout of multiblocks for testing purposes --&gt;",
                "automatic": false,
                "anononly": false,
                "nocreate": true,
                "autoblock": true,
                "noemail": true,
                "hidden": false,
                "allowusertalk": false,
                "partial": false,
                "restrictions": []
            }
        ]
    }
};
/* Each linkHotspot may carry an optional "targetYaw": <radians> to set the
   heading the destination scene opens at during a warp (see kiosk-tour.js
   warpToScene). When absent, the destination opens facing the clicked arrow's
   own "yaw" — so no hotspot needs targetYaw unless you want to fine-tune a
   specific arrival. */
window.APP_DATA = {
  "scenes": [
    {
      "id": "0-jst-1",
      "name": "JST-1",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.7720201955843162,
        "pitch": 0.09006908925874768,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.2611500571492176,
          "pitch": 0.42457672224938037,
          "rotation": 0,
          "target": "1-jst-2"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "1-jst-2",
      "name": "JST-2",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.7181365893547138,
        "pitch": 0.07661581641220216,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.43374400435723537,
          "pitch": 0.47868007408341207,
          "rotation": 0,
          "target": "0-jst-1"
        },
        {
          "yaw": -1.4770104407279607,
          "pitch": 0.3513590242915896,
          "rotation": 0,
          "target": "2-jst-3"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "2-jst-3",
      "name": "JST-3",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.4148569456065943,
        "pitch": 0.009006076191388601,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.5094491474299812,
          "pitch": 0.5020370404813903,
          "rotation": 0,
          "target": "1-jst-2"
        },
        {
          "yaw": -2.3348514925519623,
          "pitch": 0.3974617669187417,
          "rotation": 0,
          "target": "3-jst-4"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "3-jst-4",
      "name": "JST-4",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.4161229371566879,
        "pitch": 0.09244062897519001,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.833015922977072,
          "pitch": 0.29500044885556775,
          "rotation": 0,
          "target": "2-jst-3"
        },
        {
          "yaw": -0.193360032378191,
          "pitch": 0.42500349222311584,
          "rotation": 0,
          "target": "17-jst-18"
        },
        {
          "yaw": -1.9277045914337716,
          "pitch": 0.3434909495017102,
          "rotation": 0,
          "target": "4-jst-5"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "4-jst-5",
      "name": "JST-5",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.248101748329301,
        "pitch": 0.09174579255968851,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.9136517411767464,
          "pitch": 0.3614847956881988,
          "rotation": 0,
          "target": "3-jst-4"
        },
        {
          "yaw": -0.6556255703245206,
          "pitch": 0.349369570973046,
          "rotation": 0,
          "target": "5-jst-6"
        },
        {
          "yaw": -2.5609455258858524,
          "pitch": 0.23307388680854046,
          "rotation": 0,
          "target": "10-jst-11"
        },
        {
          "yaw": 2.419518122514159,
          "pitch": 0.379978798118664,
          "rotation": 0,
          "target": "8-jst-9"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "5-jst-6",
      "name": "JST-6",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.009918061848637,
        "pitch": 0.07403088883337006,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.163431146412444,
          "pitch": 0.36424443942818385,
          "rotation": 0,
          "target": "4-jst-5"
        },
        {
          "yaw": -2.061891098888685,
          "pitch": 0.4534495175629498,
          "rotation": 0,
          "target": "6-jst-7"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "6-jst-7",
      "name": "JST-7",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.1675327091434404,
        "pitch": -0.012970763889750714,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.0454795993639383,
          "pitch": 0.501037045234936,
          "rotation": 0,
          "target": "5-jst-6"
        },
        {
          "yaw": -2.1318631409573072,
          "pitch": 0.4077823527506421,
          "rotation": 0,
          "target": "7-jst-8"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "7-jst-8",
      "name": "JST-8",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.8834751949805817,
        "pitch": 0.029439248767584303,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.39773323610222633,
          "pitch": 0.38923458878809214,
          "rotation": 0,
          "target": "6-jst-7"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "8-jst-9",
      "name": "JST-9",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.3486702604421588,
        "pitch": -0.03345114013940709,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.8295792800970965,
          "pitch": 0.2861278903476059,
          "rotation": 0,
          "target": "4-jst-5"
        },
        {
          "yaw": -2.2152784526719547,
          "pitch": 0.2745467201630447,
          "rotation": 0,
          "target": "9-jst-10"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "9-jst-10",
      "name": "JST-10",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.1862035548078378,
        "pitch": 0.012854179311400316,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.736561917521316,
          "pitch": 0.28696905369781334,
          "rotation": 0,
          "target": "8-jst-9"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "10-jst-11",
      "name": "JST-11",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.2187053515059585,
        "pitch": 0.05879806380653463,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.064457813351897,
          "pitch": 0.4977829204966948,
          "rotation": 0,
          "target": "4-jst-5"
        },
        {
          "yaw": -1.9240425503704177,
          "pitch": 0.5469350279529817,
          "rotation": 0.7853981633974483,
          "target": "11-jst-12"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "11-jst-12",
      "name": "JST-12",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.798164084315827,
        "pitch": 0.037179743436512425,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.688016761242368,
          "pitch": 0.3771333053142385,
          "rotation": 0,
          "target": "12-jst-13"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "12-jst-13",
      "name": "JST-13",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.46530555867530055,
        "pitch": 0.09505373638158865,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.5453204585271578,
          "pitch": 0.24669605648182014,
          "rotation": 4.71238898038469,
          "target": "13-jst-14"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "13-jst-14",
      "name": "JST-14",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.6367309874257971,
        "pitch": 0.030020253971260402,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.633492372838826,
          "pitch": 0.3257933988775594,
          "rotation": 0,
          "target": "14-jst-15"
        },
        {
          "yaw": 0.3226218745402285,
          "pitch": 0.3399226554249317,
          "rotation": 0,
          "target": "12-jst-13"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "14-jst-15",
      "name": "JST-15",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 3.072220139143779,
        "pitch": -0.016257509403452275,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.05340247572326895,
          "pitch": 0.4920817866919531,
          "rotation": 0,
          "target": "13-jst-14"
        },
        {
          "yaw": 2.9910229249634046,
          "pitch": 0.3164815259573963,
          "rotation": 0,
          "target": "15-jst-16"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "15-jst-16",
      "name": "JST-16",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.9576865607800835,
        "pitch": 0.030422861320465344,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.8635785364528505,
          "pitch": 0.3118653740177031,
          "rotation": 0,
          "target": "16-jst-17"
        },
        {
          "yaw": -0.22586019518993972,
          "pitch": 0.5012488593836455,
          "rotation": 0,
          "target": "14-jst-15"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "16-jst-17",
      "name": "JST-17",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.9873586770368492,
        "pitch": 0.02099438736545345,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.1584449667540788,
          "pitch": 0.36166775659834727,
          "rotation": 0,
          "target": "15-jst-16"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "17-jst-18",
      "name": "JST-18",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.2922771920267362,
        "pitch": -0.08549157634316629,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.6841878868425226,
          "pitch": 0.3242878953384043,
          "rotation": 0,
          "target": "3-jst-4"
        },
        {
          "yaw": 1.2954020701802271,
          "pitch": 0.25369670790047394,
          "rotation": 0,
          "target": "18-jst-19"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "18-jst-19",
      "name": "JST-19",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.28700969921682074,
        "pitch": -0.09520709116600479,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.76913071943358,
          "pitch": 0.2639756170498302,
          "rotation": 0,
          "target": "17-jst-18"
        },
        {
          "yaw": 0.3289848217358049,
          "pitch": 0.21183302182883423,
          "rotation": 0,
          "target": "19-jst-20"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "19-jst-20",
      "name": "JST-20",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.7301927139240174,
        "pitch": 0.07453210467176596,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.452095235006702,
          "pitch": 0.25931654731527587,
          "rotation": 0,
          "target": "18-jst-19"
        },
        {
          "yaw": -0.7031993357272448,
          "pitch": 0.277664183631396,
          "rotation": 0,
          "target": "20-jst-21"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "20-jst-21",
      "name": "JST-21",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.2712885649552739,
        "pitch": 0.0700300114534329,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.8161320859526633,
          "pitch": 0.3028741773851351,
          "rotation": 0,
          "target": "19-jst-20"
        },
        {
          "yaw": 1.244545207883398,
          "pitch": 0.4406704985138319,
          "rotation": 0,
          "target": "21-jst-22"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "21-jst-22",
      "name": "JST-22",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.6537410165332176,
        "pitch": -0.003572224705850502,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.4597180016370395,
          "pitch": 0.4476135084829256,
          "rotation": 0,
          "target": "20-jst-21"
        },
        {
          "yaw": 0.6793638364609507,
          "pitch": 0.32693391851643483,
          "rotation": 0.7853981633974483,
          "target": "22-jst-23"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "22-jst-23",
      "name": "JST-23",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.1736027942705292,
        "pitch": 0.11064419204877751,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.9617784870210659,
          "pitch": 0.4714291937963768,
          "rotation": 11.780972450961727,
          "target": "23-jst-24"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "23-jst-24",
      "name": "JST-24",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.650142846383039,
        "pitch": 0.00764900638728605,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.8372803541975102,
          "pitch": 0.49102940923659233,
          "rotation": 0,
          "target": "22-jst-23"
        },
        {
          "yaw": 2.569900746761613,
          "pitch": 0.3571449244514824,
          "rotation": 0,
          "target": "24-jst-25"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "24-jst-25",
      "name": "JST-25",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.35704282270558707,
        "pitch": -0.05889093390467082,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.658486684776655,
          "pitch": 0.3072396873751373,
          "rotation": 0,
          "target": "23-jst-24"
        },
        {
          "yaw": 0.4742896319067178,
          "pitch": 0.2354795769711604,
          "rotation": 0,
          "target": "25-jst-26"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "25-jst-26",
      "name": "JST-26",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.222719883864773,
        "pitch": 0.05620829721978993,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.9492108761736411,
          "pitch": 0.33294239144974114,
          "rotation": 0,
          "target": "24-jst-25"
        },
        {
          "yaw": 2.559292230752934,
          "pitch": 0.4320841792807997,
          "rotation": 0,
          "target": "26-jst-27"
        },
        {
          "yaw": -0.659696670620832,
          "pitch": 0.3178804988146169,
          "rotation": 0,
          "target": "69-jst-71"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "26-jst-27",
      "name": "JST-27",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.24434609527919982,
        "pitch": 0.17497519457536015,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.7023853730131595,
          "pitch": 0.37417824963023705,
          "rotation": 0,
          "target": "44-jst-45"
        },
        {
          "yaw": -1.0729889958227936,
          "pitch": 0.38682333738394803,
          "rotation": 0,
          "target": "27-jst-28"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "27-jst-28",
      "name": "JST-28",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.5055382431639064,
        "pitch": 0.0686013099000391,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.5891912473406347,
          "pitch": 0.3849244450764715,
          "rotation": 0,
          "target": "26-jst-27"
        },
        {
          "yaw": 2.423683290765217,
          "pitch": 0.35445462431991714,
          "rotation": 0,
          "target": "28-jst-29"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "28-jst-29",
      "name": "JST-29",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.5956825991556691,
        "pitch": 0.11622978550539109,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.18682595310130168,
          "pitch": 0.32622390389107636,
          "rotation": 0,
          "target": "29-jst-30"
        },
        {
          "yaw": -1.3669220449577928,
          "pitch": 0.44562966923252567,
          "rotation": 0,
          "target": "45-jst-46"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "29-jst-30",
      "name": "JST-30",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.2928274633901644,
        "pitch": 0,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -3.0759062573669578,
          "pitch": 0.3369369169297034,
          "rotation": 0,
          "target": "28-jst-29"
        },
        {
          "yaw": 0.3728437057497782,
          "pitch": 0.338185280941282,
          "rotation": 0,
          "target": "30-jst-31"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "30-jst-31",
      "name": "JST-31",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.4033649826831365,
        "pitch": -0.015438987756649425,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.702509440342432,
          "pitch": 0.2877029525606112,
          "rotation": 0,
          "target": "29-jst-30"
        },
        {
          "yaw": -0.3906022208017692,
          "pitch": 0.31801033194827255,
          "rotation": 0,
          "target": "31-jst-32"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "31-jst-32",
      "name": "JST-32",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.948950995575551,
        "pitch": 0.04910738876265519,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.28252192612128546,
          "pitch": 0.34919914810606656,
          "rotation": 0,
          "target": "30-jst-31"
        },
        {
          "yaw": -2.9262832698196117,
          "pitch": 0.3113786667808345,
          "rotation": 0,
          "target": "32-jst-33"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "32-jst-33",
      "name": "JST-33",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.80099260940883,
        "pitch": -0.010476794047924898,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.23966113054636828,
          "pitch": 0.2686773970157681,
          "rotation": 0,
          "target": "31-jst-32"
        },
        {
          "yaw": -2.7337776751084206,
          "pitch": 0.3907465388703706,
          "rotation": 0,
          "target": "33-jst-34"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "33-jst-34",
      "name": "JST-34",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.8590356978461404,
        "pitch": -0.006296499830435565,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.2172630050281708,
          "pitch": 0.2955314709904844,
          "rotation": 0,
          "target": "32-jst-33"
        },
        {
          "yaw": -1.7855791315915042,
          "pitch": 0.3713380540637097,
          "rotation": 0,
          "target": "34-jst-35"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "34-jst-35",
      "name": "JST-35",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.9864303617232482,
        "pitch": 0.01534816476848988,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.138347233240383,
          "pitch": 0.32216359921353366,
          "rotation": 0,
          "target": "33-jst-34"
        },
        {
          "yaw": 1.902630662786363,
          "pitch": 0.4440262211756849,
          "rotation": 0,
          "target": "35-jst-36"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "35-jst-36",
      "name": "JST-36",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.24395460142913805,
        "pitch": 0.04250602125859082,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.827125944181505,
          "pitch": 0.37403537818495636,
          "rotation": 0,
          "target": "36-jst-37"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "36-jst-37",
      "name": "JST-37",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.8399867825445488,
        "pitch": 0.02039158090311588,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.2911134031648182,
          "pitch": 0.3608188048736416,
          "rotation": 0,
          "target": "35-jst-36"
        },
        {
          "yaw": 1.7243119251253187,
          "pitch": 0.3054096459455682,
          "rotation": 0,
          "target": "37-jst-38"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "37-jst-38",
      "name": "JST-38",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.85565943088541,
        "pitch": 0.016011979359795703,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.45428819862865844,
          "pitch": 0.33456661725846715,
          "rotation": 0,
          "target": "36-jst-37"
        },
        {
          "yaw": -2.744881478462558,
          "pitch": 0.496579305451883,
          "rotation": 0,
          "target": "63-jst-65"
        },
        {
          "yaw": -1.1958129548447296,
          "pitch": 0.2883176801560925,
          "rotation": 0,
          "target": "38-jst-39"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "38-jst-39",
      "name": "JST-39",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.660292114682626,
        "pitch": 0.01726065501253693,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.5367248130671953,
          "pitch": 0.3022833598251946,
          "rotation": 0,
          "target": "37-jst-38"
        },
        {
          "yaw": -2.4877814721934435,
          "pitch": 0.33741838838722416,
          "rotation": 0,
          "target": "39-jst-40"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "39-jst-40",
      "name": "JST-40",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.8097585765345725,
        "pitch": -0.030877975513297073,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.41127148364551047,
          "pitch": 0.35992249368696605,
          "rotation": 0,
          "target": "38-jst-39"
        },
        {
          "yaw": 2.948509773869919,
          "pitch": 0.31117904748482417,
          "rotation": 0,
          "target": "40-jst-41"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "40-jst-41",
      "name": "JST-41",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.8415124985838993,
        "pitch": -0.030910899814745818,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.315330460138373,
          "pitch": 0.38504514998725625,
          "rotation": 0,
          "target": "39-jst-40"
        },
        {
          "yaw": -0.8446771293116786,
          "pitch": 0.3938185084548351,
          "rotation": 0,
          "target": "41-jst-42"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "41-jst-42",
      "name": "JST-42",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.4231193071959254,
        "pitch": 0.04059461139253706,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.7556245028264428,
          "pitch": 0.4788128428653948,
          "rotation": 0,
          "target": "40-jst-41"
        },
        {
          "yaw": 2.846375910281087,
          "pitch": 0.2703599640526164,
          "rotation": 0,
          "target": "42-jst-43"
        },
        {
          "yaw": -0.1620426841767859,
          "pitch": 0.4276735066292616,
          "rotation": 0,
          "target": "67-jst-69"
        },
        {
          "yaw": 1.3790228007545586,
          "pitch": 0.3282578772812208,
          "rotation": 0,
          "target": "43-jst-44"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "42-jst-43",
      "name": "JST-43",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.1900359286329998,
        "pitch": 0.026044162666439163,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.9818146728229138,
          "pitch": 0.37498506736151427,
          "rotation": 0,
          "target": "41-jst-42"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "43-jst-44",
      "name": "JST-44",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -3.1037625785045613,
        "pitch": -0.052076123749030145,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.10545490107092981,
          "pitch": 0.2706911691782068,
          "rotation": 0,
          "target": "41-jst-42"
        },
        {
          "yaw": -3.056427925486947,
          "pitch": 0.2638307762311456,
          "rotation": 0,
          "target": "44-jst-45"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "44-jst-45",
      "name": "JST-45",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.7787643237925295,
        "pitch": 0.03875425621719408,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.4254461714828608,
          "pitch": 0.33086096110863394,
          "rotation": 0,
          "target": "43-jst-44"
        },
        {
          "yaw": 2.652626463255549,
          "pitch": 0.35522917065799575,
          "rotation": 0,
          "target": "26-jst-27"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "45-jst-46",
      "name": "JST-46",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.6664184265217878,
        "pitch": -0.0025706558787970124,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.2585737650994062,
          "pitch": 0.4492991463437441,
          "rotation": 0,
          "target": "28-jst-29"
        },
        {
          "yaw": 1.5578706992911577,
          "pitch": 0.27100571270538865,
          "rotation": 0,
          "target": "46-jst-47"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "46-jst-47",
      "name": "JST-47",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.0160181166531617,
        "pitch": 0.06833522204887288,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.1680374480712388,
          "pitch": 0.2372534070039265,
          "rotation": 0,
          "target": "45-jst-46"
        },
        {
          "yaw": 1.991987749799315,
          "pitch": 0.2594600446812656,
          "rotation": 0,
          "target": "47-jst-48"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "47-jst-48",
      "name": "JST-48",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.317572152684857,
        "pitch": -0.03517227713404125,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.0858063385193937,
          "pitch": 0.4279624545537146,
          "rotation": 0,
          "target": "46-jst-47"
        },
        {
          "yaw": -2.515018294019832,
          "pitch": 0.2557591154407888,
          "rotation": 0,
          "target": "48-jst-49"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "48-jst-49",
      "name": "JST-49",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.8935463618732964,
        "pitch": 0.040067849177967574,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.0934938897056767,
          "pitch": 0.41529253582327286,
          "rotation": 0,
          "target": "47-jst-48"
        },
        {
          "yaw": 1.8255393446414434,
          "pitch": 0.29061284555183775,
          "rotation": 0,
          "target": "49-jst-50"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "49-jst-50",
      "name": "JST-50",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.2504037921579307,
        "pitch": -0.028989524036205694,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.8979909232052616,
          "pitch": 0.3068342794331649,
          "rotation": 0,
          "target": "48-jst-49"
        },
        {
          "yaw": -2.259921139743046,
          "pitch": 0.3467720423680447,
          "rotation": 1.5707963267948966,
          "target": "50-jst-51"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "50-jst-51",
      "name": "JST-51",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.2874255341949654,
        "pitch": -0.010094722763964725,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.4283441835271944,
          "pitch": 0.345834012707428,
          "rotation": 0,
          "target": "49-jst-50"
        },
        {
          "yaw": 2.268687078447609,
          "pitch": 0.3369461511233265,
          "rotation": 0,
          "target": "51-jst-52"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "51-jst-52",
      "name": "JST-52",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.26991551002798,
        "pitch": -0.008895143887009738,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.8672888600530584,
          "pitch": 0.4552431939932191,
          "rotation": 0,
          "target": "50-jst-51"
        },
        {
          "yaw": -1.3305208296338087,
          "pitch": 0.4466067442444448,
          "rotation": 0,
          "target": "52-jst-53"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "52-jst-53",
      "name": "JST-53",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.8385841028963306,
        "pitch": -0.018012152382757662,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.4007640036040865,
          "pitch": 0.24949822062789373,
          "rotation": 0,
          "target": "51-jst-52"
        },
        {
          "yaw": -2.79729511817337,
          "pitch": 0.26929671157026647,
          "rotation": 0,
          "target": "53-jst-54"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "53-jst-54",
      "name": "JST-54",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.8809975237649041,
        "pitch": 0.035236167607342495,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.409986191575647,
          "pitch": 0.37608810073038157,
          "rotation": 0,
          "target": "52-jst-53"
        },
        {
          "yaw": -0.9322971774171052,
          "pitch": 0.26463289695966097,
          "rotation": 0,
          "target": "54-jst-56"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "54-jst-56",
      "name": "JST-56",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.1452376511543019,
        "pitch": -0.04031291247570046,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.9983925259499955,
          "pitch": 0.3140871590827672,
          "rotation": 0,
          "target": "53-jst-54"
        },
        {
          "yaw": 1.1411070236531096,
          "pitch": 0.29654520453584254,
          "rotation": 0,
          "target": "55-jst-57"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "55-jst-57",
      "name": "JST-57",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.0896182597771258,
        "pitch": 0.028304810887190612,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.0024071595693016,
          "pitch": 0.31714477787200757,
          "rotation": 0,
          "target": "54-jst-56"
        },
        {
          "yaw": 1.158663223295644,
          "pitch": 0.30124262760708476,
          "rotation": 0,
          "target": "56-jst-58"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "56-jst-58",
      "name": "JST-58",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.36457988819437404,
        "pitch": 0.12092498836679866,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.9737916199063479,
          "pitch": 0.3537126350589155,
          "rotation": 0,
          "target": "55-jst-57"
        },
        {
          "yaw": 0.45610024476950706,
          "pitch": 0.26316140171450186,
          "rotation": 0,
          "target": "57-jst-59"
        },
        {
          "yaw": -1.2045131653926813,
          "pitch": 0.3900916169450035,
          "rotation": 0,
          "target": "103-jst-107"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "57-jst-59",
      "name": "JST-59",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.7128726865279162,
        "pitch": -0.026529813725259643,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.5799663143541594,
          "pitch": 0.282384865322582,
          "rotation": 7.853981633974483,
          "target": "56-jst-58"
        },
        {
          "yaw": -2.6366881511298157,
          "pitch": 0.29463543583651663,
          "rotation": 0,
          "target": "58-jst-60"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "58-jst-60",
      "name": "JST-60",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 3.0481311277033942,
        "pitch": -0.04924721756145978,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.017032460127509808,
          "pitch": 0.25867703571907974,
          "rotation": 0,
          "target": "57-jst-59"
        },
        {
          "yaw": 3.0007574530484105,
          "pitch": 0.3111691741290201,
          "rotation": 0,
          "target": "59-jst-61"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "59-jst-61",
      "name": "JST-61",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.682405607015383,
        "pitch": -0.0617559510265977,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.4177361924496363,
          "pitch": 0.3320843794605661,
          "rotation": 0,
          "target": "58-jst-60"
        },
        {
          "yaw": 0.6104752977033101,
          "pitch": 0.3324990221571298,
          "rotation": 0,
          "target": "60-jst-62"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "60-jst-62",
      "name": "JST-62",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.2967059728390318,
        "pitch": -0.06690228027881417,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.8998167655830924,
          "pitch": 0.28275623659914473,
          "rotation": 0,
          "target": "59-jst-61"
        },
        {
          "yaw": -0.3438966076507288,
          "pitch": 0.23739954021367993,
          "rotation": 0,
          "target": "61-jst-63"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "61-jst-63",
      "name": "JST-63",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.5020273707975074,
        "pitch": 0.06231938224922473,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.5813473234529702,
          "pitch": 0.3445017432734794,
          "rotation": 0,
          "target": "60-jst-62"
        },
        {
          "yaw": 1.475723179643765,
          "pitch": 0.41274476372675295,
          "rotation": 0,
          "target": "62-jst-64"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "62-jst-64",
      "name": "JST-64",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.6298989597701699,
        "pitch": -0.012865823130541187,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.6426483880524803,
          "pitch": 0.44073399444405403,
          "rotation": 0,
          "target": "35-jst-36"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "63-jst-65",
      "name": "JST-65",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.3112932846495786,
        "pitch": 0.07066305934773887,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.8404769064140147,
          "pitch": 0.2784002234865568,
          "rotation": 0,
          "target": "37-jst-38"
        },
        {
          "yaw": 2.3145840634066097,
          "pitch": 0.3810454446583531,
          "rotation": 0,
          "target": "64-jst-66"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "64-jst-66",
      "name": "JST-66",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.7961808203240404,
        "pitch": 0.10521384248975174,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.16671740489193176,
          "pitch": 0.3033433388685829,
          "rotation": 0,
          "target": "65-jst-67"
        },
        {
          "yaw": -2.9567980706292936,
          "pitch": 0.28647445278902595,
          "rotation": 0,
          "target": "66-jst-68"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "65-jst-67",
      "name": "JST-67",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.7716678178107905,
        "pitch": -0.02083444872767437,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.372624701570672,
          "pitch": 0.2697359629413718,
          "rotation": 0,
          "target": "64-jst-66"
        },
        {
          "yaw": -0.8189653373204102,
          "pitch": 0.2485636824476245,
          "rotation": 0,
          "target": "89-jst-93"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "66-jst-68",
      "name": "JST-68",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.6013934568915893,
        "pitch": -0.01855253519756417,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.6002525668660752,
          "pitch": 0.2989521179706838,
          "rotation": 0,
          "target": "64-jst-66"
        },
        {
          "yaw": 1.5991338593683277,
          "pitch": 0.16655979128466036,
          "rotation": 0,
          "target": "67-jst-69"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "67-jst-69",
      "name": "JST-69",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.4114900113768378,
        "pitch": 0.005885201962898989,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.8717847973488055,
          "pitch": 0.19850340917208165,
          "rotation": 0,
          "target": "66-jst-68"
        },
        {
          "yaw": 1.4628256853547734,
          "pitch": 0.20193028649035405,
          "rotation": 0,
          "target": "68-jst-70"
        },
        {
          "yaw": -0.15480129284784816,
          "pitch": 0.1558704455542852,
          "rotation": 0,
          "target": "70-jst-72"
        },
        {
          "yaw": 2.906184707199211,
          "pitch": 0.10247784813084948,
          "rotation": 0,
          "target": "41-jst-42"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "68-jst-70",
      "name": "JST-70",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.6612886410916001,
        "pitch": -0.05918278640048946,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.289338448047296,
          "pitch": 0.18106013800046838,
          "rotation": 0,
          "target": "67-jst-69"
        },
        {
          "yaw": -0.6591186859874991,
          "pitch": 0.2210552106704533,
          "rotation": 0,
          "target": "69-jst-71"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "69-jst-71",
      "name": "JST-71",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.887702411215624,
        "pitch": -0.0065917938543247345,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.3033627776584407,
          "pitch": 0.11628646445842428,
          "rotation": 0,
          "target": "25-jst-26"
        },
        {
          "yaw": 0.23627427307041415,
          "pitch": 0.1989327778065615,
          "rotation": 0,
          "target": "68-jst-70"
        },
        {
          "yaw": 2.346295690749386,
          "pitch": 0.2995069130626895,
          "rotation": 6.283185307179586,
          "target": "74-jst-76"
        },
        {
          "yaw": -2.738316330646157,
          "pitch": 0.2360022396460888,
          "rotation": 0,
          "target": "88-jst-92"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "70-jst-72",
      "name": "JST-72",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.15589237561372293,
          "pitch": 0.1198300919659232,
          "rotation": 0,
          "target": "67-jst-69"
        },
        {
          "yaw": 2.9961364813945774,
          "pitch": 0.12367308563280588,
          "rotation": 0,
          "target": "71-jst-73"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "71-jst-73",
      "name": "JST-73",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.7614536904619946,
        "pitch": -0.032649566930325946,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.4586354298009496,
          "pitch": 0.1358652468025472,
          "rotation": 0,
          "target": "70-jst-72"
        },
        {
          "yaw": -0.5571393858934357,
          "pitch": -1.4920144290098847,
          "rotation": 0,
          "target": "72-jst-74"
        },
        {
          "yaw": -1.7040396055853009,
          "pitch": 0.11991508240901716,
          "rotation": 0,
          "target": "73-jst-75"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "72-jst-74",
      "name": "JST-74",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.4477950611282644,
          "pitch": 0.2866530968284291,
          "rotation": 0,
          "target": "71-jst-73"
        },
        {
          "yaw": -1.7141580128473954,
          "pitch": 0.11742075388772477,
          "rotation": 0,
          "target": "73-jst-75"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.7499025808273343,
          "pitch": -0.12893654360987838,
          "title": "PRESSPOINT: EASTER EGG",
          "text": "CHARANN! You've found Justine! Thank you for exploring to our virtual tour!"
        },
        {
          "yaw": -1.4960200099542273,
          "pitch": 0.11718317873527617,
          "title": "OH, HI KAPIYU!",
          "text": "Look behind you :)"
        }
      ]
    },
    {
      "id": "73-jst-75",
      "name": "JST-75",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.326187707431469,
        "pitch": -0.052767072328645526,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.9256015029313573,
          "pitch": 0.11641787830074257,
          "rotation": 0,
          "target": "71-jst-73"
        },
        {
          "yaw": -2.213068514809816,
          "pitch": -0.01552512964896735,
          "rotation": 0,
          "target": "204-jst-212"
        },
        {
          "yaw": 0.48767366477119367,
          "pitch": 0.16081528324434657,
          "rotation": 5.497787143782138,
          "target": "76-jst-78"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "74-jst-76",
      "name": "JST-76",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.32773404843003817,
        "pitch": -0.09006076191378831,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.672513003036496,
          "pitch": 0.3103521324673988,
          "rotation": 0,
          "target": "69-jst-71"
        },
        {
          "yaw": 0.3204600226520995,
          "pitch": 0.19841248997751038,
          "rotation": 0,
          "target": "75-jst-77"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "75-jst-77",
      "name": "JST-77",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.5526875964648656,
        "pitch": -0.09006076191378831,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.476687971428289,
          "pitch": 0.21015998914858436,
          "rotation": 0,
          "target": "74-jst-76"
        },
        {
          "yaw": -0.4882853258005042,
          "pitch": 0.2202386670190748,
          "rotation": 0,
          "target": "76-jst-78"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "76-jst-78",
      "name": "JST-78",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.758248597255303,
        "pitch": -0.046316963269948275,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.8770134309119335,
          "pitch": 0.2375454710946201,
          "rotation": 0,
          "target": "75-jst-77"
        },
        {
          "yaw": -0.7042605097132082,
          "pitch": 0.1681890713367924,
          "rotation": 0,
          "target": "77-jst-79"
        },
        {
          "yaw": -2.647850273361687,
          "pitch": 0.16234195100613924,
          "rotation": 5.497787143782138,
          "target": "73-jst-75"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "77-jst-79",
      "name": "JST-79",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.35488361457218076,
        "pitch": -0.05403645714827299,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.8043047436688706,
          "pitch": 0.408562133629939,
          "rotation": 0,
          "target": "76-jst-78"
        },
        {
          "yaw": -0.4307094459665066,
          "pitch": 0.21154040647302352,
          "rotation": 0,
          "target": "78-jst-80"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "78-jst-80",
      "name": "JST-80",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.2036195827579892,
        "pitch": -0.05403645714827299,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.935156812123674,
          "pitch": 0.2861640491416573,
          "rotation": 0,
          "target": "77-jst-79"
        },
        {
          "yaw": -0.11207590360816155,
          "pitch": 0.21127020742337876,
          "rotation": 0,
          "target": "79-jst-81"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "79-jst-81",
      "name": "JST-81",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 3.069003237457732,
          "pitch": 0.24516383019913057,
          "rotation": 0,
          "target": "78-jst-80"
        },
        {
          "yaw": -0.09592971599688482,
          "pitch": 0.22898317474878382,
          "rotation": 0,
          "target": "80-jst-82"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "80-jst-82",
      "name": "JST-82",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.5654239488734625,
        "pitch": -0.036024304765515325,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 3.064340486716212,
          "pitch": 0.4196084881227691,
          "rotation": 0,
          "target": "79-jst-81"
        },
        {
          "yaw": -1.6083386077777178,
          "pitch": 0.2501508978493945,
          "rotation": 0,
          "target": "81-jst-84"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "81-jst-84",
      "name": "JST-84",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.0362914105439103,
        "pitch": -0.06888725096483306,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.5538373089124553,
          "pitch": 0.17521550478853243,
          "rotation": 0,
          "target": "80-jst-82"
        },
        {
          "yaw": 1.0331228475350223,
          "pitch": 0.14279494651058044,
          "rotation": 0,
          "target": "82-jst-85"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "82-jst-85",
      "name": "JST-85",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.6621567715906425,
        "pitch": 0.021443038550900795,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.5334173487974958,
          "pitch": 0.160399826099777,
          "rotation": 0,
          "target": "81-jst-84"
        },
        {
          "yaw": 2.3909033580824595,
          "pitch": 0.216626516906274,
          "rotation": 0.7853981633974483,
          "target": "83-jst-86"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "83-jst-86",
      "name": "JST-86",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.0200597169201595,
        "pitch": -0.00029528364218478487,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.024530468071534,
          "pitch": 0.2224440601362474,
          "rotation": 5.497787143782138,
          "target": "82-jst-85"
        },
        {
          "yaw": 1.9400473046108608,
          "pitch": 0.1737744491157116,
          "rotation": 0,
          "target": "84-jst-87"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "84-jst-87",
      "name": "JST-87",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -3.0027723811314573,
        "pitch": 0.006955089263312786,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.1953719607798874,
          "pitch": 0.23056739226765544,
          "rotation": 0,
          "target": "83-jst-86"
        },
        {
          "yaw": -3.0027723011968472,
          "pitch": 0.09652488130189596,
          "rotation": 0,
          "target": "85-jst-89"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "85-jst-89",
      "name": "JST-89",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 3.030240775318444,
        "pitch": 0.01103111095300946,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 3.0849185209560694,
          "pitch": 0.33254241335177603,
          "rotation": 0.7853981633974483,
          "target": "86-jst-90"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "86-jst-90",
      "name": "JST-90",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -3.039602282220688,
        "pitch": 0.017921293747297895,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.19831090568976073,
          "pitch": 0.16785910775384494,
          "rotation": 4.71238898038469,
          "target": "85-jst-89"
        },
        {
          "yaw": -2.898066458441983,
          "pitch": 0.17856861410512082,
          "rotation": 0,
          "target": "87-jst-91"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "87-jst-91",
      "name": "JST-91",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.1732491082850736,
        "pitch": -0.02168810184863368,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.8377517264771441,
          "pitch": 0.12392879967454817,
          "rotation": 0,
          "target": "86-jst-90"
        },
        {
          "yaw": 1.2560856828593252,
          "pitch": 0.15002963774935196,
          "rotation": 0,
          "target": "88-jst-92"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "88-jst-92",
      "name": "JST-92",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.950581674529582,
        "pitch": -0.00428860771018158,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.051011132183385,
          "pitch": 0.17413893277208636,
          "rotation": 0,
          "target": "87-jst-91"
        },
        {
          "yaw": 2.1589457676499357,
          "pitch": 0.27395595434695963,
          "rotation": 0,
          "target": "69-jst-71"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "89-jst-93",
      "name": "JST-93",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.580455794433174,
        "pitch": -0.03594522566743663,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.3269204013643279,
          "pitch": 0.1683407088473441,
          "rotation": 0,
          "target": "64-jst-66"
        },
        {
          "yaw": 1.5950289509406925,
          "pitch": 0.25669253205438736,
          "rotation": 6.283185307179586,
          "target": "90-jst-94"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "90-jst-94",
      "name": "JST-94",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.6143218217211812,
        "pitch": 0.015438987756649425,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.3644720661213148,
          "pitch": 0.25123776485761695,
          "rotation": 0,
          "target": "91-jst-95"
        },
        {
          "yaw": 0.8962786392746427,
          "pitch": 0.2511775156146214,
          "rotation": 0,
          "target": "95-jst-99"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "91-jst-95",
      "name": "JST-95",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.153317982994553,
        "pitch": -0.07006925212633242,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.18883936818020075,
          "pitch": 0.14034181080677577,
          "rotation": 1.5707963267948966,
          "target": "90-jst-94"
        },
        {
          "yaw": 2.2414693526774983,
          "pitch": 0.18939730171854663,
          "rotation": 0,
          "target": "92-jst-96"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "92-jst-96",
      "name": "JST-96",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.3987752199964545,
        "pitch": -0.02526979619998393,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.6775019600745047,
          "pitch": 0.19849116004579948,
          "rotation": 0,
          "target": "91-jst-95"
        },
        {
          "yaw": 0.08814819424351938,
          "pitch": 0.16177507936578905,
          "rotation": 0,
          "target": "90-jst-94"
        },
        {
          "yaw": 2.4529297095821008,
          "pitch": 0.2165547274184938,
          "rotation": 0,
          "target": "93-jst-97"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "93-jst-97",
      "name": "JST-97",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.47114765484890064,
        "pitch": -0.045974175139930296,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.6576058819347654,
          "pitch": 0.21204292579789907,
          "rotation": 0,
          "target": "92-jst-96"
        },
        {
          "yaw": 0.5614089133019853,
          "pitch": 0.3407476681872392,
          "rotation": 0,
          "target": "94-jst-98"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "94-jst-98",
      "name": "JST-98",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.52703548508201,
          "pitch": 0.14200198915261808,
          "rotation": 0,
          "target": "93-jst-97"
        },
        {
          "yaw": 1.7536651352439776,
          "pitch": 0.1650178028915832,
          "rotation": 0.7853981633974483,
          "target": "188-jst-196"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "95-jst-99",
      "name": "JST-99",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -3.002042608883965,
        "pitch": -0.04055649892243629,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -3.0996795543270235,
          "pitch": 0.17609524628398177,
          "rotation": 13.351768777756625,
          "target": "96-jst-100"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "96-jst-100",
      "name": "JST-100",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.9705127696285025,
        "pitch": 0.012865823130539411,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.493553552475463,
          "pitch": 0.23395878303027473,
          "rotation": 0,
          "target": "95-jst-99"
        },
        {
          "yaw": 1.3446313790680122,
          "pitch": 0.24087723250255522,
          "rotation": 0.7853981633974483,
          "target": "130-jst-135"
        },
        {
          "yaw": 0.2249957196440988,
          "pitch": 0.17087244035234228,
          "rotation": 0,
          "target": "97-jst-101"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "97-jst-101",
      "name": "JST-101",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.7989713793100996,
        "pitch": -0.057599300476733006,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.2546198088295473,
          "pitch": 0.25191721267988854,
          "rotation": 0,
          "target": "96-jst-100"
        },
        {
          "yaw": 0.621663921111713,
          "pitch": 0.15761277568440946,
          "rotation": 0,
          "target": "98-jst-102"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "98-jst-102",
      "name": "JST-102",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.26567789724801827,
        "pitch": -0.07719493878324712,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.830222978757215,
          "pitch": 0.17734390416254264,
          "rotation": 0,
          "target": "97-jst-101"
        },
        {
          "yaw": 0.31731377374586955,
          "pitch": 0.15094893371698248,
          "rotation": 0,
          "target": "99-jst-103"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "99-jst-103",
      "name": "JST-103",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.3548863900705541,
        "pitch": -0.08749128005000628,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.775754405294329,
          "pitch": 0.18727815959269734,
          "rotation": 0,
          "target": "98-jst-102"
        },
        {
          "yaw": -0.42380621006305397,
          "pitch": 0.2019351926904811,
          "rotation": 0,
          "target": "100-jst-104"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "100-jst-104",
      "name": "JST-104",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.39754721850982655,
        "pitch": -0.036024304765515325,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.766686778336192,
          "pitch": 0.19545827664061655,
          "rotation": 0,
          "target": "99-jst-103"
        },
        {
          "yaw": -0.44201997314542574,
          "pitch": 0.22693923306779062,
          "rotation": 0,
          "target": "101-jst-105"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "101-jst-105",
      "name": "JST-105",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.30651846181488196,
        "pitch": 0.007607707430834054,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.867827955728581,
          "pitch": 0.2999264407369502,
          "rotation": 0,
          "target": "100-jst-104"
        },
        {
          "yaw": -1.8510090928815437,
          "pitch": 0.0870815023375009,
          "rotation": 0,
          "target": "102-jst-106"
        },
        {
          "yaw": -0.36428850736133,
          "pitch": 0.22505066196344892,
          "rotation": 0,
          "target": "104-jst-108"
        },
        {
          "yaw": 1.2527951064458165,
          "pitch": 0.2024983424378224,
          "rotation": 0,
          "target": "106-jst-110"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "102-jst-106",
      "name": "JST-106",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.3895159157755117,
        "pitch": 0.0005390498305288816,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.7620423120460167,
          "pitch": 0.4215789326613564,
          "rotation": 0,
          "target": "101-jst-105"
        },
        {
          "yaw": -1.3120602589698613,
          "pitch": 0.20994875076408093,
          "rotation": 0,
          "target": "103-jst-107"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "103-jst-107",
      "name": "JST-107",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.7349775405620527,
        "pitch": -0.005146329252216475,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.696571326670302,
          "pitch": 0.3137205748856289,
          "rotation": 0,
          "target": "56-jst-58"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "104-jst-108",
      "name": "JST-108",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.454441043328612,
        "pitch": -0.0035381013609026013,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.8511550322066324,
          "pitch": 0.16373580957394474,
          "rotation": 0,
          "target": "101-jst-105"
        },
        {
          "yaw": 1.2921178472760104,
          "pitch": 0.1750579402574992,
          "rotation": 0,
          "target": "105-jst-109"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "105-jst-109",
      "name": "JST-109",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.47503625713646613,
        "pitch": 0.029622288071221803,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.6565111323662816,
          "pitch": 0.19218425701889075,
          "rotation": 0,
          "target": "104-jst-108"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "106-jst-110",
      "name": "JST-110",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.7356579825447334,
        "pitch": 0.056609621774381225,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.319612463765779,
          "pitch": 0.3007820475594212,
          "rotation": 0,
          "target": "101-jst-105"
        },
        {
          "yaw": 0.7617344028634534,
          "pitch": 0.5857616284051304,
          "rotation": 0,
          "target": "107-jst-111"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "107-jst-111",
      "name": "JST-111",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.1939426654569676,
        "pitch": -0.036047117886820246,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.61194610007567,
          "pitch": 0.392080808460193,
          "rotation": 0,
          "target": "106-jst-110"
        },
        {
          "yaw": -0.17182743630546327,
          "pitch": 0.37520497011872145,
          "rotation": 0,
          "target": "108-jst-112"
        },
        {
          "yaw": 2.9636811702004033,
          "pitch": 0.2962243571930685,
          "rotation": 0,
          "target": "110-jst-114"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "108-jst-112",
      "name": "JST-112",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.1784566845368225,
        "pitch": -0.01089629002091641,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.9622654875473442,
          "pitch": 0.37509890442989224,
          "rotation": 0,
          "target": "107-jst-111"
        },
        {
          "yaw": -1.1464972281753525,
          "pitch": 0.28474011295286417,
          "rotation": 0,
          "target": "109-jst-113"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "109-jst-113",
      "name": "JST-113",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 0.858065147369226,
          "pitch": 0.24751613821724128,
          "rotation": 0,
          "target": "108-jst-112"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "110-jst-114",
      "name": "JST-114",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.589565502941948,
        "pitch": 0.013018040624327654,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.4818762096515528,
          "pitch": 0.2866250665752297,
          "rotation": 0,
          "target": "107-jst-111"
        },
        {
          "yaw": 1.6185302213769583,
          "pitch": 0.27907627639079813,
          "rotation": 0,
          "target": "111-jst-115"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "111-jst-115",
      "name": "JST-115",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.5409523953174862,
        "pitch": 0.07029885672442404,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.6375105449860339,
          "pitch": 0.25930997099560393,
          "rotation": 0,
          "target": "110-jst-114"
        },
        {
          "yaw": -0.06614945057261679,
          "pitch": 0.11320597075856753,
          "rotation": 0,
          "target": "112-jst-116"
        },
        {
          "yaw": 1.4691563542189767,
          "pitch": 0.3370301270461411,
          "rotation": 0,
          "target": "116-jst-120"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "112-jst-116",
      "name": "JST-116",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -3.1224901467492927,
        "pitch": 0.3154788270935498,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.4612379765926686,
          "pitch": 0.6639765956817598,
          "rotation": 0,
          "target": "111-jst-115"
        },
        {
          "yaw": -2.3522291922690393,
          "pitch": 0.14110859794169528,
          "rotation": 11.780972450961727,
          "target": "113-jst-117"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "113-jst-117",
      "name": "JST-117",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.302813682856657,
          "pitch": 0.6013050541150022,
          "rotation": 0.7853981633974483,
          "target": "112-jst-116"
        },
        {
          "yaw": -0.08617675175190165,
          "pitch": 0.22003299724218195,
          "rotation": 1.5707963267948966,
          "target": "114-jst-118"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "114-jst-118",
      "name": "JST-118",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.402337528045196,
        "pitch": 0.07039879982651875,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.3903910198768052,
          "pitch": 0.3610725284347307,
          "rotation": 0,
          "target": "113-jst-117"
        },
        {
          "yaw": 2.3760940964802053,
          "pitch": 0.27126812831063063,
          "rotation": 0,
          "target": "115-jst-119"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "115-jst-119",
      "name": "JST-119",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.4240715849031265,
        "pitch": 0.12538892882342267,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.7877426249246255,
          "pitch": 0.25684271640606227,
          "rotation": 0,
          "target": "114-jst-118"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "116-jst-120",
      "name": "JST-120",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.3179248700733304,
        "pitch": -0.0011586144398307852,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.8351832839282078,
          "pitch": 0.3176290395092387,
          "rotation": 0,
          "target": "111-jst-115"
        },
        {
          "yaw": -2.2826727710228667,
          "pitch": 0.33783598755583455,
          "rotation": 0,
          "target": "117-jst-121"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "117-jst-121",
      "name": "JST-121",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.804745867881122,
        "pitch": 0.11453211226009152,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.43282355582715226,
          "pitch": 0.3863772474823328,
          "rotation": 0,
          "target": "116-jst-120"
        },
        {
          "yaw": -2.789663462869335,
          "pitch": 0.4925312633485053,
          "rotation": 0,
          "target": "118-jst-123"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "118-jst-123",
      "name": "JST-123",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.7276160358454735,
        "pitch": 0.11712049314317774,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.26944223006965373,
          "pitch": 0.26960121172626117,
          "rotation": 0,
          "target": "117-jst-121"
        },
        {
          "yaw": 2.754117316332035,
          "pitch": 0.32869611571675605,
          "rotation": 0,
          "target": "119-jst-124"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "119-jst-124",
      "name": "JST-124",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.1628230905269383,
        "pitch": 0.1021913951511415,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.3784193241159493,
          "pitch": 0.27972867786071376,
          "rotation": 0,
          "target": "120-jst-125"
        },
        {
          "yaw": 0.5219227931824051,
          "pitch": 0.2372243079519727,
          "rotation": 0,
          "target": "118-jst-123"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "120-jst-125",
      "name": "JST-125",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.6190392802411573,
          "pitch": 0.22652333876404818,
          "rotation": 1.5707963267948966,
          "target": "119-jst-124"
        },
        {
          "yaw": -0.13073765490015177,
          "pitch": 0.3993708791092807,
          "rotation": 0,
          "target": "121-jst-126"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "121-jst-126",
      "name": "JST-126",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.044399575821835,
        "pitch": 0.01227201590913829,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.096492480489614,
          "pitch": 0.44342647372400634,
          "rotation": 0,
          "target": "120-jst-125"
        },
        {
          "yaw": -2.059211943511448,
          "pitch": 0.1661458076940754,
          "rotation": 0,
          "target": "122-jst-127"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "122-jst-127",
      "name": "JST-127",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.3006948981824014,
        "pitch": 0.0018564867913166694,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.7752400743852315,
          "pitch": 0.08620914340885477,
          "rotation": 0,
          "target": "121-jst-126"
        },
        {
          "yaw": -1.403026306618301,
          "pitch": 0.2577511298910231,
          "rotation": 0,
          "target": "123-jst-128"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "123-jst-128",
      "name": "JST-128",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.7183468298058564,
        "pitch": -0.008843595918559544,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.42862825638230717,
          "pitch": 0.2096705859852417,
          "rotation": 0,
          "target": "122-jst-127"
        },
        {
          "yaw": -2.756730002906405,
          "pitch": 0.24817140475282784,
          "rotation": 0,
          "target": "124-jst-129"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "124-jst-129",
      "name": "JST-129",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.988545439464298,
        "pitch": 0.017031899191847444,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.15423244843381312,
          "pitch": 0.24347423996021433,
          "rotation": 0,
          "target": "123-jst-128"
        },
        {
          "yaw": -2.9820977708519862,
          "pitch": 0.29806094749025114,
          "rotation": 0,
          "target": "125-jst-130"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "125-jst-130",
      "name": "JST-130",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.8021396814000816,
        "pitch": 0.11004764660314947,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.32598561611846755,
          "pitch": 0.27878227402482736,
          "rotation": 0,
          "target": "124-jst-129"
        },
        {
          "yaw": 2.7995399560619862,
          "pitch": 0.20503820664409034,
          "rotation": 0,
          "target": "126-jst-131"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "126-jst-131",
      "name": "JST-131",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.267842506425348,
        "pitch": 0.016078338719232477,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.2292049891094265,
          "pitch": 0.24141198236305783,
          "rotation": 0,
          "target": "127-jst-132"
        },
        {
          "yaw": -0.9389339728420047,
          "pitch": 0.2207922508159097,
          "rotation": 0,
          "target": "125-jst-130"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "127-jst-132",
      "name": "JST-132",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.243542706065263,
        "pitch": 0.05169551050659038,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.9416791291126234,
          "pitch": 0.22600587841603748,
          "rotation": 0,
          "target": "126-jst-131"
        },
        {
          "yaw": -2.198376132426624,
          "pitch": 0.1506506074397027,
          "rotation": 0,
          "target": "128-jst-133"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "128-jst-133",
      "name": "JST-133",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.3974042981783974,
        "pitch": 0.043463438164481616,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.7911921338102825,
          "pitch": 0.08026665227220242,
          "rotation": 0,
          "target": "127-jst-132"
        },
        {
          "yaw": -1.4525978547225815,
          "pitch": 0.3151437635690204,
          "rotation": 0,
          "target": "129-jst-134"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "129-jst-134",
      "name": "JST-134",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.6883380924851217,
        "pitch": 0.01090046756912777,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.5011687559470133,
          "pitch": 0.20860215603804022,
          "rotation": 0,
          "target": "128-jst-133"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "130-jst-135",
      "name": "JST-135",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.576376828025861,
        "pitch": -0.02889015427298247,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.5886024638341176,
          "pitch": 0.27554308305863096,
          "rotation": 0,
          "target": "96-jst-100"
        },
        {
          "yaw": 2.522271363980713,
          "pitch": 0.2159565057710502,
          "rotation": 0,
          "target": "131-jst-136"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "131-jst-136",
      "name": "JST-136",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.002368814886239,
        "pitch": -0.04698385421672846,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.1979382217854262,
          "pitch": 0.1612441905499704,
          "rotation": 0,
          "target": "130-jst-135"
        },
        {
          "yaw": -2.103506271849799,
          "pitch": 0.2121467263437271,
          "rotation": 0,
          "target": "132-jst-138"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "132-jst-138",
      "name": "JST-138",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.274859474333514,
        "pitch": -0.07928069449429387,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.8475136281511038,
          "pitch": 0.19331124905685826,
          "rotation": 0,
          "target": "131-jst-136"
        },
        {
          "yaw": -1.3409334823544157,
          "pitch": 0.18052080540640247,
          "rotation": 0,
          "target": "133-jst-139"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "133-jst-139",
      "name": "JST-139",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.302176067422657,
        "pitch": -0.0126935805996915,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.3942864003173163,
          "pitch": 0.19793287749818056,
          "rotation": 0,
          "target": "160-jst-166"
        },
        {
          "yaw": -1.9484402514288348,
          "pitch": 0.2112376190907561,
          "rotation": 0,
          "target": "134-jst-140"
        },
        {
          "yaw": 2.675566721366339,
          "pitch": 0.1843877181742144,
          "rotation": 0,
          "target": "132-jst-138"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "134-jst-140",
      "name": "JST-140",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.592783566573793,
        "pitch": -0.056609621774381225,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.5005630886643306,
          "pitch": 0.21972366009577726,
          "rotation": 0,
          "target": "133-jst-139"
        },
        {
          "yaw": -2.676189083525795,
          "pitch": 0.20815867990254944,
          "rotation": 0,
          "target": "135-jst-141"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "135-jst-141",
      "name": "JST-141",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.6389454339359197,
        "pitch": -0.07124134219735012,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.458249026853494,
          "pitch": 0.23644205672775342,
          "rotation": 0,
          "target": "134-jst-140"
        },
        {
          "yaw": 2.526310244300947,
          "pitch": 0.15778867318118017,
          "rotation": 0,
          "target": "136-jst-142"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "136-jst-142",
      "name": "JST-142",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.189395036117716,
        "pitch": -0.10956682218232316,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.9875908819888721,
          "pitch": 0.18089966579883843,
          "rotation": 0,
          "target": "135-jst-141"
        },
        {
          "yaw": -2.167767810454203,
          "pitch": 0.18051278127355808,
          "rotation": 0,
          "target": "137-jst-143"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "137-jst-143",
      "name": "JST-143",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.391723901091492,
        "pitch": -0.1080206772188177,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.8243746240796987,
          "pitch": 0.18316921270437625,
          "rotation": 0,
          "target": "136-jst-142"
        },
        {
          "yaw": -1.3948557005991091,
          "pitch": 0.1641084650431992,
          "rotation": 0,
          "target": "138-jst-144"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "138-jst-144",
      "name": "JST-144",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.309531075168426,
        "pitch": 0.03235201709101432,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.8075519994928495,
          "pitch": 0.18444734433448318,
          "rotation": 0,
          "target": "137-jst-143"
        },
        {
          "yaw": -2.4114562241482282,
          "pitch": 0.20457553523222316,
          "rotation": 0,
          "target": "139-jst-145"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "139-jst-145",
      "name": "JST-145",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.9488962555886022,
        "pitch": -0.08354265694383756,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.3436887118315113,
          "pitch": 0.18073971279568823,
          "rotation": 0,
          "target": "138-jst-144"
        },
        {
          "yaw": -3.0649901119750442,
          "pitch": 0.16353795183233544,
          "rotation": 0,
          "target": "140-jst-146"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "140-jst-146",
      "name": "JST-146",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.5508983270908816,
        "pitch": 0.09653517613431717,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.4531956798335504,
          "pitch": 0.235651846329052,
          "rotation": 0,
          "target": "141-jst-147"
        },
        {
          "yaw": 2.5384741820400807,
          "pitch": 0.2867673359938223,
          "rotation": 0.7853981633974483,
          "target": "144-jst-150"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "141-jst-147",
      "name": "JST-147",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.0201864725831147,
        "pitch": 0.030189295476695577,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.006652864994182,
          "pitch": 0.36097970759673004,
          "rotation": 0,
          "target": "140-jst-146"
        },
        {
          "yaw": 0.992413074505107,
          "pitch": 0.1892354184143752,
          "rotation": 0,
          "target": "142-jst-148"
        },
        {
          "yaw": 2.548130648486148,
          "pitch": 0.22435668321294244,
          "rotation": 0,
          "target": "144-jst-150"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "142-jst-148",
      "name": "JST-148",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.1990401698813145,
        "pitch": 0.10105117488038218,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.8879374056615372,
          "pitch": 0.36483992498487794,
          "rotation": 0,
          "target": "141-jst-147"
        },
        {
          "yaw": 1.222276305134045,
          "pitch": 0.37903025935606394,
          "rotation": 0,
          "target": "143-jst-149"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "143-jst-149",
      "name": "JST-149",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.1057507570566951,
        "pitch": -0.031241682353485345,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.9422228127402477,
          "pitch": 0.2736297440869908,
          "rotation": 0,
          "target": "142-jst-148"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "144-jst-150",
      "name": "JST-150",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.6008168704870123,
        "pitch": -0.05302465266930945,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.7494779815882833,
          "pitch": 0.16788124764979528,
          "rotation": 1.5707963267948966,
          "target": "141-jst-147"
        },
        {
          "yaw": 2.1158420576537864,
          "pitch": 0.19013874167294276,
          "rotation": 4.71238898038469,
          "target": "140-jst-146"
        },
        {
          "yaw": -0.5470788918393108,
          "pitch": 0.22473292661488387,
          "rotation": 0,
          "target": "145-jst-151"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "145-jst-151",
      "name": "JST-151",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.6996357773591582,
        "pitch": -0.07555918588390576,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.07490947828033256,
          "pitch": 0.2098863766620589,
          "rotation": 0,
          "target": "146-jst-152"
        },
        {
          "yaw": 1.7222207047580467,
          "pitch": 0.21845844924567004,
          "rotation": 0,
          "target": "149-jst-155"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "146-jst-152",
      "name": "JST-152",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.2947667181145892,
        "pitch": -0.056609621774381225,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.6927934044572943,
          "pitch": 0.23772963291670912,
          "rotation": 0,
          "target": "145-jst-151"
        },
        {
          "yaw": -0.42162692143438996,
          "pitch": 0.19896330511185312,
          "rotation": 0,
          "target": "147-jst-153"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "147-jst-153",
      "name": "JST-153",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.6358765550310927,
        "pitch": -0.07615448266115088,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.440618400549619,
          "pitch": 0.29705854348327776,
          "rotation": 0,
          "target": "146-jst-152"
        },
        {
          "yaw": -0.7222190972505231,
          "pitch": 0.24632650283991175,
          "rotation": 0,
          "target": "148-jst-154"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "148-jst-154",
      "name": "JST-154",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.8847144492812316,
        "pitch": 0.014245158711171158,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.4150901244146894,
          "pitch": 0.2845627302249589,
          "rotation": 0,
          "target": "147-jst-153"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "149-jst-155",
      "name": "JST-155",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.23852833110589344,
        "pitch": -0.07976810340935536,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.8096176774471555,
          "pitch": 0.3179263165345745,
          "rotation": 0,
          "target": "145-jst-151"
        },
        {
          "yaw": 0.3194130456360007,
          "pitch": 0.20214180167278073,
          "rotation": 0,
          "target": "150-jst-156"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "150-jst-156",
      "name": "JST-156",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.55084685737814,
        "pitch": -0.020409711606953707,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.4596749072982194,
          "pitch": 0.19376707753289324,
          "rotation": 0,
          "target": "149-jst-155"
        },
        {
          "yaw": -1.6861938359778321,
          "pitch": 0.20113861557651447,
          "rotation": 0,
          "target": "153-jst-159"
        },
        {
          "yaw": 3.054257494693325,
          "pitch": 0.2644822973948706,
          "rotation": 0,
          "target": "151-jst-157"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "151-jst-157",
      "name": "JST-157",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.8088519448643527,
        "pitch": -0.02456589290126132,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.256214759611174,
          "pitch": 0.23018516398522948,
          "rotation": 0,
          "target": "150-jst-156"
        },
        {
          "yaw": 1.7737391107953666,
          "pitch": 0.1654594600836834,
          "rotation": 0,
          "target": "152-jst-158"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "152-jst-158",
      "name": "JST-158",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.7647235882385957,
        "pitch": 0.02128667998901257,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.5784536376063123,
          "pitch": 0.16461500769290538,
          "rotation": 0,
          "target": "151-jst-157"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "153-jst-159",
      "name": "JST-159",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.7946861728671308,
        "pitch": -0.12689764498228406,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.3810803796867788,
          "pitch": 0.22545235468279756,
          "rotation": 0,
          "target": "150-jst-156"
        },
        {
          "yaw": 0.7544675952384239,
          "pitch": 0.20927168836115584,
          "rotation": 0,
          "target": "154-jst-160"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "154-jst-160",
      "name": "JST-160",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.5803817429284734,
        "pitch": -0.04920087969908238,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.6548498333872788,
          "pitch": 0.1647519085382818,
          "rotation": 0,
          "target": "153-jst-159"
        },
        {
          "yaw": -1.583554524047024,
          "pitch": 0.19293021007509026,
          "rotation": 0,
          "target": "155-jst-161"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "155-jst-161",
      "name": "JST-161",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.411606668917825,
        "pitch": 0.004516384557541997,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.6259507947318852,
          "pitch": 0.19597297300121497,
          "rotation": 0,
          "target": "154-jst-160"
        },
        {
          "yaw": 2.4501056697549526,
          "pitch": 0.15716250425597345,
          "rotation": 0,
          "target": "156-jst-162"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "156-jst-162",
      "name": "JST-162",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.608011083375491,
        "pitch": -0.0019105222263284816,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.26315316003013045,
          "pitch": 0.3329061789012435,
          "rotation": 1.5707963267948966,
          "target": "155-jst-161"
        },
        {
          "yaw": 2.775281474333407,
          "pitch": 0.18758586137040467,
          "rotation": 0,
          "target": "157-jst-163"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "157-jst-163",
      "name": "JST-163",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.196565109562453,
        "pitch": -0.09537298682419859,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.4535599176265777,
          "pitch": 0.2064230888469787,
          "rotation": 0,
          "target": "156-jst-162"
        },
        {
          "yaw": -2.0074372053444876,
          "pitch": 0.148862475422737,
          "rotation": 0,
          "target": "158-jst-164"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "158-jst-164",
      "name": "JST-164",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.612804492922443,
        "pitch": -0.15953620681871072,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.9877983660751593,
          "pitch": 0.1445262606521176,
          "rotation": 0,
          "target": "157-jst-163"
        },
        {
          "yaw": -0.73722689113138,
          "pitch": 0.13147642467741782,
          "rotation": 0,
          "target": "159-jst-165"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "159-jst-165",
      "name": "JST-165",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.1555111647089973,
        "pitch": -0.03179103392901261,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.7737179593551033,
          "pitch": 0.13805039265231756,
          "rotation": 0,
          "target": "158-jst-164"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "160-jst-166",
      "name": "JST-166",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.220099145414549,
        "pitch": -0.06567689639780916,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.087877343837036,
          "pitch": 0.1539252915225653,
          "rotation": 0,
          "target": "133-jst-139"
        },
        {
          "yaw": -2.2111539600648076,
          "pitch": 0.24235995199102867,
          "rotation": 0,
          "target": "161-jst-168"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "161-jst-168",
      "name": "JST-168",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.2068122437959712,
          "pitch": 0.15494212058775325,
          "rotation": 0,
          "target": "160-jst-166"
        },
        {
          "yaw": -0.5189762008226815,
          "pitch": 0.20718673888552175,
          "rotation": 0,
          "target": "162-jst-169"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "162-jst-169",
      "name": "JST-169",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.16677590630167494,
        "pitch": -0.03859746939162356,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.9630080829494396,
          "pitch": 0.21013418715553733,
          "rotation": 0,
          "target": "161-jst-168"
        },
        {
          "yaw": 0.271194149161051,
          "pitch": 0.189401786987494,
          "rotation": 0,
          "target": "163-jst-170"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "163-jst-170",
      "name": "JST-170",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.9760609496930712,
        "pitch": -0.0626019703451508,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.25039241107496757,
          "pitch": 0.15743343671649512,
          "rotation": 0,
          "target": "162-jst-169"
        },
        {
          "yaw": 1.7006437330351512,
          "pitch": 0.1610100150357816,
          "rotation": 0,
          "target": "164-jst-171"
        },
        {
          "yaw": -2.9745830716086026,
          "pitch": 0.19282541322269253,
          "rotation": 0,
          "target": "165-jst-172"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "164-jst-171",
      "name": "JST-171",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.624691798467385,
        "pitch": -0.011317759124633398,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.9035653595991135,
          "pitch": 0.4360657152214973,
          "rotation": 0,
          "target": "163-jst-170"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "165-jst-172",
      "name": "JST-172",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.831122757007897,
        "pitch": 0.0010495758058031157,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.3071989715009735,
          "pitch": 0.2535140903626143,
          "rotation": 0,
          "target": "163-jst-170"
        },
        {
          "yaw": -1.8631920748242194,
          "pitch": 0.17246608010695041,
          "rotation": 0,
          "target": "166-jst-173"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "166-jst-173",
      "name": "JST-173",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -3.108331787870881,
        "pitch": -0.04042420909166822,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.12598042691460165,
          "pitch": 0.1629271791905076,
          "rotation": 0,
          "target": "165-jst-172"
        },
        {
          "yaw": -3.062336266583614,
          "pitch": 0.1668507331938045,
          "rotation": 0,
          "target": "167-jst-174"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "167-jst-174",
      "name": "JST-174",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.811352855032168,
        "pitch": -0.05922081346393426,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.3601249969134681,
          "pitch": 0.15989908639560824,
          "rotation": 0,
          "target": "166-jst-173"
        },
        {
          "yaw": 2.7864522896870483,
          "pitch": 0.168178275170062,
          "rotation": 0,
          "target": "168-jst-175"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "168-jst-175",
      "name": "JST-175",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.2935302475953137,
        "pitch": -0.08214415851372436,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.797802249586578,
          "pitch": 0.12968238161649204,
          "rotation": 0,
          "target": "167-jst-174"
        },
        {
          "yaw": -2.26523175443349,
          "pitch": 0.1928836583013247,
          "rotation": 0,
          "target": "169-jst-176"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "169-jst-176",
      "name": "JST-176",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.330119411622011,
        "pitch": -0.03554192624602592,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.782290930866341,
          "pitch": 0.16393348600710134,
          "rotation": 0,
          "target": "168-jst-175"
        },
        {
          "yaw": -1.3842025376265568,
          "pitch": 0.18200411656727766,
          "rotation": 0,
          "target": "170-jst-177"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "170-jst-177",
      "name": "JST-177",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.3181873834242879,
        "pitch": -0.08310899201639366,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.7756113633507713,
          "pitch": 0.21981312899349348,
          "rotation": 0,
          "target": "169-jst-176"
        },
        {
          "yaw": -1.3717076027344266,
          "pitch": 0.16783562564400967,
          "rotation": 0,
          "target": "171-jst-178"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "171-jst-178",
      "name": "JST-178",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.4014099873825234,
        "pitch": -0.14924354831427777,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.6798913961259956,
          "pitch": 0.14560866414402618,
          "rotation": 0,
          "target": "170-jst-177"
        },
        {
          "yaw": 0.5191623606210918,
          "pitch": 0.17279156477318125,
          "rotation": 0,
          "target": "172-jst-179"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "172-jst-179",
      "name": "JST-179",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.6321970401668331,
        "pitch": -0.11321924354876067,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.596804404680009,
          "pitch": 0.16923972731621006,
          "rotation": 0,
          "target": "171-jst-178"
        },
        {
          "yaw": -0.579167231803412,
          "pitch": 0.15720639542342774,
          "rotation": 0,
          "target": "173-jst-180"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "173-jst-180",
      "name": "JST-180",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.31415926535897754,
        "pitch": -0.11064607892265421,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.837085711772197,
          "pitch": 0.1241847513609784,
          "rotation": 0,
          "target": "172-jst-179"
        },
        {
          "yaw": -0.2257517973886518,
          "pitch": 0.16791834921235704,
          "rotation": 0,
          "target": "174-jst-181"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "174-jst-181",
      "name": "JST-181",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.005824736019715004,
        "pitch": -0.06691153110508097,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.8433333389057402,
          "pitch": 0.20737384840251671,
          "rotation": 0,
          "target": "173-jst-180"
        },
        {
          "yaw": -0.7278326168944993,
          "pitch": 0.19048456066032315,
          "rotation": 0,
          "target": "175-jst-182"
        },
        {
          "yaw": -2.4148512381309253,
          "pitch": 0.1855039849584319,
          "rotation": 4.71238898038469,
          "target": "189-jst-197"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "175-jst-182",
      "name": "JST-182",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.31419361656471523,
        "pitch": -0.015438987756649425,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.62133225660037,
          "pitch": 0.22135626896810656,
          "rotation": 6.283185307179586,
          "target": "174-jst-181"
        },
        {
          "yaw": 0.43820412568503997,
          "pitch": 0.21598427115889507,
          "rotation": 0,
          "target": "176-jst-183"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "176-jst-183",
      "name": "JST-183",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.2249557113428402,
        "pitch": -0.05146329252216475,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.6720199614303937,
          "pitch": 0.2178610706640285,
          "rotation": 0,
          "target": "175-jst-182"
        },
        {
          "yaw": 0.409970639619166,
          "pitch": 0.250607479753171,
          "rotation": 0,
          "target": "177-jst-184"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "177-jst-184",
      "name": "JST-184",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.8883787300480428,
        "pitch": 0.03968090712893613,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.414712628867795,
          "pitch": 0.3409369089946743,
          "rotation": 0,
          "target": "176-jst-183"
        },
        {
          "yaw": -1.8368008819052193,
          "pitch": 0.1670653820254735,
          "rotation": 0,
          "target": "178-jst-185"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "178-jst-185",
      "name": "JST-185",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.1939254724438051,
        "pitch": 0.015438987756649425,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.9626332504833943,
          "pitch": 0.21699168877672648,
          "rotation": 0,
          "target": "177-jst-184"
        },
        {
          "yaw": -0.06905450638300081,
          "pitch": 0.2254131131336834,
          "rotation": 0,
          "target": "179-jst-186"
        },
        {
          "yaw": 1.4290601874664572,
          "pitch": 0.23096246792144015,
          "rotation": 0,
          "target": "180-jst-188"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "179-jst-186",
      "name": "JST-186",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.507120850968878,
        "pitch": -0.0024542358549624055,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.6213788496547199,
          "pitch": 0.3123128733199927,
          "rotation": 5.497787143782138,
          "target": "178-jst-185"
        },
        {
          "yaw": -2.684433609708808,
          "pitch": 0.20708670504834892,
          "rotation": 0,
          "target": "201-jst-209"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "180-jst-188",
      "name": "JST-188",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.7682363213560706,
        "pitch": 0.00803159753059468,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.3213565744098936,
          "pitch": 0.23601635219284312,
          "rotation": 0,
          "target": "178-jst-185"
        },
        {
          "yaw": -2.8003624954894963,
          "pitch": 0.23791749767740455,
          "rotation": 0,
          "target": "181-jst-189"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "181-jst-189",
      "name": "JST-189",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.429642577844394,
        "pitch": -0.04199049574414637,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.7245476821928278,
          "pitch": 0.3017417224790222,
          "rotation": 0,
          "target": "180-jst-188"
        },
        {
          "yaw": -2.4201430313326373,
          "pitch": 0.27418682929614846,
          "rotation": 0,
          "target": "182-jst-190"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "182-jst-190",
      "name": "JST-190",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.67936327410753,
        "pitch": -0.0541864421039957,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.5106181285019185,
          "pitch": 0.22885401023989616,
          "rotation": 0,
          "target": "181-jst-189"
        },
        {
          "yaw": -1.6100144326127328,
          "pitch": 0.2556073794230347,
          "rotation": 0,
          "target": "183-jst-191"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "183-jst-191",
      "name": "JST-191",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.4418093671648933,
        "pitch": -0.045940394212665936,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.6717758739450694,
          "pitch": 0.27996246348437026,
          "rotation": 0,
          "target": "182-jst-190"
        },
        {
          "yaw": -2.419644791106567,
          "pitch": 0.2468388190059123,
          "rotation": 0,
          "target": "184-jst-192"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "184-jst-192",
      "name": "JST-192",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -2.67082378658095,
        "pitch": -0.008782102859738572,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.4306163006354726,
          "pitch": 0.24028058289077592,
          "rotation": 0,
          "target": "183-jst-191"
        },
        {
          "yaw": -2.5782434087195885,
          "pitch": 0.20205565158281402,
          "rotation": 0,
          "target": "185-jst-193"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "185-jst-193",
      "name": "JST-193",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -3.000580633223345,
        "pitch": 0.060095555921170885,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.1821574466915461,
          "pitch": 0.2208929223582139,
          "rotation": 0,
          "target": "184-jst-192"
        },
        {
          "yaw": -3.0686254236884487,
          "pitch": 0.22174435061837272,
          "rotation": 0,
          "target": "186-jst-194"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "186-jst-194",
      "name": "JST-194",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.754197106606598,
        "pitch": -0.053267781053611074,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.22301497325424968,
          "pitch": 0.23720720148640595,
          "rotation": 0,
          "target": "185-jst-193"
        },
        {
          "yaw": 2.281783921378169,
          "pitch": 0.24826627932844403,
          "rotation": 11.780972450961727,
          "target": "188-jst-196"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "187-jst-195",
      "name": "JST-195",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [],
      "infoHotspots": []
    },
    {
      "id": "188-jst-196",
      "name": "JST-196",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.49450995473172554,
        "pitch": 0.0205853170088659,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.063975629773731,
          "pitch": 0.375490967582067,
          "rotation": 0,
          "target": "94-jst-98"
        },
        {
          "yaw": 2.6290320179171776,
          "pitch": 0.41245105648116365,
          "rotation": 1.5707963267948966,
          "target": "186-jst-194"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "189-jst-197",
      "name": "JST-197",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.9036881017927456,
        "pitch": 0.11579851156641752,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.7643470835736803,
          "pitch": 0.3137700263901664,
          "rotation": 7.0685834705770345,
          "target": "174-jst-181"
        },
        {
          "yaw": -0.847271563360632,
          "pitch": 0.3513607342582432,
          "rotation": 0.7853981633974483,
          "target": "191-jst-199"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "190-jst-198",
      "name": "JST-198",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.6400391885492098,
          "pitch": 0.2880470607948702,
          "rotation": 0,
          "target": "189-jst-197"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "191-jst-199",
      "name": "JST-199",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.6105909591500058,
        "pitch": -0.002600204762407188,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.2923420409020867,
          "pitch": 0.42560413190139457,
          "rotation": 0,
          "target": "189-jst-197"
        },
        {
          "yaw": -1.5274441206098768,
          "pitch": 0.25075410918366536,
          "rotation": 0,
          "target": "192-jst-200"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "192-jst-200",
      "name": "JST-200",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.4779488987163507,
        "pitch": -0.0205853170088659,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.4365073629731135,
          "pitch": 0.25430872332120913,
          "rotation": 0,
          "target": "193-jst-201"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "193-jst-201",
      "name": "JST-201",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -1.31195304478371,
        "pitch": -0.07136686350274069,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 1.8560690736640488,
          "pitch": 0.18777831423962965,
          "rotation": 0,
          "target": "192-jst-200"
        },
        {
          "yaw": -1.3214067172133497,
          "pitch": 0.20669506467749876,
          "rotation": 0,
          "target": "194-jst-202"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "194-jst-202",
      "name": "JST-202",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.7737626350508187,
        "pitch": -0.07462177415713889,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.363506691094318,
          "pitch": 0.2619164086004737,
          "rotation": 0,
          "target": "193-jst-201"
        },
        {
          "yaw": -0.7802948855654499,
          "pitch": 0.20100422983225386,
          "rotation": 0,
          "target": "195-jst-203"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "195-jst-203",
      "name": "JST-203",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": -0.2873080460975288,
        "pitch": -0.012667887390076515,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 2.9120446027534044,
          "pitch": 0.23773007728521023,
          "rotation": 0,
          "target": "194-jst-202"
        },
        {
          "yaw": 1.1143409017334633,
          "pitch": 0.4545699379478023,
          "rotation": 12.566370614359176,
          "target": "196-jst-204"
        },
        {
          "yaw": -0.2421878159730717,
          "pitch": 0.24020441058260822,
          "rotation": 0,
          "target": "197-jst-205"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "196-jst-204",
      "name": "JST-204",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.695058128261234,
          "pitch": 0.49046697282667395,
          "rotation": 0,
          "target": "195-jst-203"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "197-jst-205",
      "name": "JST-205",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.2986411684854442,
        "pitch": -0.03859746939162356,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.8387170129339108,
          "pitch": 0.22621042319540052,
          "rotation": 0,
          "target": "195-jst-203"
        },
        {
          "yaw": 0.29723055628907247,
          "pitch": 0.23354213590219075,
          "rotation": 0,
          "target": "198-jst-206"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "198-jst-206",
      "name": "JST-206",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.6195570533958499,
        "pitch": -0.033088066610861944,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.4841145889144016,
          "pitch": 0.2828591767224893,
          "rotation": 0,
          "target": "197-jst-205"
        },
        {
          "yaw": 0.6131947930931965,
          "pitch": 0.23008756533628905,
          "rotation": 0,
          "target": "199-jst-207"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "199-jst-207",
      "name": "JST-207",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.7933650237447836,
        "pitch": -0.03505481082698836,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -2.318540274511111,
          "pitch": 0.25726918203508475,
          "rotation": 0,
          "target": "198-jst-206"
        },
        {
          "yaw": 0.8092576177562751,
          "pitch": 0.23406845145609623,
          "rotation": 0,
          "target": "200-jst-208"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "200-jst-208",
      "name": "JST-208",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.97951097768338,
        "pitch": 0.051906941595630585,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.1322082202332098,
          "pitch": 0.24920875833789147,
          "rotation": 0,
          "target": "199-jst-207"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "201-jst-209",
      "name": "JST-209",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 1.0231806273016364,
        "pitch": 0.03631699178693637,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.9338675381048862,
          "pitch": 0.24690894232854887,
          "rotation": 0,
          "target": "179-jst-186"
        },
        {
          "yaw": 0.583760549175242,
          "pitch": 0.22715213699318682,
          "rotation": 0,
          "target": "202-jst-210"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "202-jst-210",
      "name": "JST-210",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.788296654244359,
        "pitch": -0.06947544490492241,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": 0.6851478604072039,
          "pitch": 0.27401589521496206,
          "rotation": 10.995574287564278,
          "target": "203-jst-211"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "203-jst-211",
      "name": "JST-211",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 0.6964188545588215,
        "pitch": -0.02586480009520109,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -0.6452920562796223,
          "pitch": 0.3204425927397825,
          "rotation": 0,
          "target": "202-jst-210"
        },
        {
          "yaw": 2.3015405448027906,
          "pitch": 0.14721192882237943,
          "rotation": 0,
          "target": "204-jst-212"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "204-jst-212",
      "name": "JST-212",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 750,
      "initialViewParameters": {
        "yaw": 2.733255178930217,
        "pitch": -0.11561494854548826,
        "fov": 1.5104476355254983
      },
      "linkHotspots": [
        {
          "yaw": -1.9336341230849072,
          "pitch": 0.2815025131891371,
          "rotation": 0,
          "target": "203-jst-211"
        },
        {
          "yaw": 2.7808800606151145,
          "pitch": 0.10747604342568451,
          "rotation": 0,
          "target": "73-jst-75"
        }
      ],
      "infoHotspots": []
    }
  ],
  "name": "Project Title",
  "settings": {
    "mouseViewMode": "drag",
    "autorotateEnabled": true,
    "fullscreenButton": false,
    "viewControlButtons": false
  }
};

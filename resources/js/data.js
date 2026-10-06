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
        "yaw": -1.9394217698135492,
        "pitch": 0.06373311094797174,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.2586356958014697,
          "pitch": 0.43998766105439024,
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
        "yaw": -1.673195474962096,
        "pitch": 0.161220565888204,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.4810078892081009,
          "pitch": 0.41186547256546646,
          "rotation": 0,
          "target": "0-jst-1"
        },
        {
          "yaw": -1.5346360319296704,
          "pitch": 0.2903613474801858,
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
        "yaw": -2.439679140185742,
        "pitch": 0.061455997878713475,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.5272690481217168,
          "pitch": 0.466851634801257,
          "rotation": 0,
          "target": "1-jst-2"
        },
        {
          "yaw": -2.3736724801298976,
          "pitch": 0.34180059370861926,
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
        "yaw": -0.4719512773250045,
        "pitch": 0.005661825089822159,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.9177589499604277,
          "pitch": 0.3230009869406185,
          "rotation": 0,
          "target": "2-jst-3"
        },
        {
          "yaw": -0.2317087038480956,
          "pitch": 0.33112554520112525,
          "rotation": 0,
          "target": "17-jst-18"
        },
        {
          "yaw": -1.9078552681140035,
          "pitch": 0.28788355787372666,
          "rotation": 0,
          "target": "4-jst-5"
        },
        {
          "yaw": 0.42,
          "pitch": 0.2096,
          "rotation": 0,
          "target": "86-jst-90"
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
        "yaw": -2.2814138894590617,
        "pitch": 0.020905311637797297,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.8874640504047768,
          "pitch": 0.3195755552328947,
          "rotation": 0,
          "target": "3-jst-4"
        },
        {
          "yaw": -2.600288760142348,
          "pitch": 0.20870950259630305,
          "rotation": 0,
          "target": "10-jst-11"
        },
        {
          "yaw": -0.6201910716913339,
          "pitch": 0.36866099191033186,
          "rotation": 0,
          "target": "5-jst-6"
        },
        {
          "yaw": 2.406160408368308,
          "pitch": 0.3801280653991306,
          "rotation": 0,
          "target": "9-jst-9"
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
        "yaw": -2.0676687598323475,
        "pitch": 0.03209158241539534,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.1508661879227624,
          "pitch": 0.3273220076438399,
          "rotation": 0,
          "target": "4-jst-5"
        },
        {
          "yaw": -2.049821400073636,
          "pitch": 0.3157970427705479,
          "rotation": 0,
          "target": "6-jst-7"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.5815360794408724,
          "pitch": 0.3213407074239676,
          "title": "Gender and Development",
          "text": "It conducts gender sensitivity trainings and seminars, integrates gender perspectives into university programs and policies, and supports initiatives that address gender-related concerns among students, faculty, and staff."
        }
      ]
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
        "yaw": -2.1762300789109474,
        "pitch": 0.018508600423833954,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.0667175395757234,
          "pitch": 0.4106186767642157,
          "rotation": 0,
          "target": "5-jst-6"
        },
        {
          "yaw": -2.1466580205750603,
          "pitch": 0.37405391785231856,
          "rotation": 0,
          "target": "7-jst-8"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.924651636370556,
          "pitch": 0.3756997467778973,
          "title": "Extension and Training Services Office",
          "text": "It plans and implements extension programs, trainings, and technology transfer projects for partner barangays, local government units, and other stakeholders, allowing faculty and students to apply their knowledge in service of community development."
        }
      ]
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
        "yaw": -2.8760004296973563,
        "pitch": 0.12468314245260359,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.4206143940143008,
          "pitch": 0.4026969337816979,
          "rotation": 0,
          "target": "6-jst-7"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.3920783864569852,
          "pitch": 0.3702854107641631,
          "title": "Alumni Affairs and Placement Services Office",
          "text": "&nbsp;It maintains alumni records, conducts tracer studies, organizes job fairs and career orientations, and builds partnerships with employers for internship and job opportunities."
        }
      ]
    },
    {
      "id": "8-jst-10",
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
        "yaw": -0.19826272916373533,
        "pitch": 0.11992843546726029,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.7012271010585973,
          "pitch": 0.3483955416073208,
          "rotation": 0,
          "target": "9-jst-9"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.533398056135571,
          "pitch": 0.12622564188306562,
          "title": "Safety and Security Management Office",
          "text": "It oversees campus security personnel, monitors the entry and movement of students, employees, and visitors, safeguards university property, and implements safety protocols and emergency preparedness measures such as disaster response and crisis management."
        }
      ]
    },
    {
      "id": "9-jst-9",
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
        "yaw": -2.278473305366802,
        "pitch": 0.026547966749330243,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.8161179497430098,
          "pitch": 0.26220095564330315,
          "rotation": 0,
          "target": "4-jst-5"
        },
        {
          "yaw": -2.1847040767512276,
          "pitch": 0.27495379416523846,
          "rotation": 0,
          "target": "8-jst-10"
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
        "yaw": -1.4795255970452885,
        "pitch": 0.16154278064886896,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.0735923954234607,
          "pitch": 0.5339820766649428,
          "rotation": 0,
          "target": "4-jst-5"
        },
        {
          "yaw": -1.8922111268823443,
          "pitch": 0.5279793465809028,
          "rotation": 0,
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
        "yaw": 1.7895084524789748,
        "pitch": -0.0811580811961683,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.60275623661283,
          "pitch": 0.6304448392047561,
          "rotation": 4.71238898038469,
          "target": "10-jst-11"
        },
        {
          "yaw": 1.6971147575612573,
          "pitch": 0.25000616566504164,
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
        "yaw": 0.3944977509282772,
        "pitch": 0.04869084637988408,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.779376768925946,
          "pitch": 0.49571152640227645,
          "rotation": 0,
          "target": "11-jst-12"
        },
        {
          "yaw": 0.793238129098409,
          "pitch": 0.4788670979708307,
          "rotation": 4.71238898038469,
          "target": "14-jst-14"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "13-jst-15",
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
        "yaw": 3.0662173895311327,
        "pitch": -0.004883010838501178,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.07679019216555005,
          "pitch": 0.5090820069793569,
          "rotation": 0,
          "target": "14-jst-14"
        },
        {
          "yaw": 2.9985029471921774,
          "pitch": 0.3403972163117128,
          "rotation": 0,
          "target": "15-jst-16"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.203332968007775,
          "pitch": 0.17087866374187044,
          "title": "Office of Research and Development Services&nbsp;",
          "text": "It manages research programs and funding, supports faculty and student researchers, monitors the conduct and ethics of studies, and promotes the publication, presentation, and utilization of research outputs for academic and community benefit."
        },
        {
          "yaw": 1.484594811328595,
          "pitch": 0.1793629145845177,
          "title": "Innovation and Technology Support Office",
          "text": "The Innovation and Technology Support Office (ITSO) of Laguna State Polytechnic University assists the university community in protecting and commercializing its intellectual property. In partnership with the Intellectual Property Office of the Philippines, it provides patent searches, IP awareness seminars, and guidance on filing patents, utility models, copyrights, and trademarks for faculty and student innovations."
        }
      ]
    },
    {
      "id": "14-jst-14",
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
        "yaw": 1.6831346048120075,
        "pitch": 0.03484280680131846,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.3942239271668271,
          "pitch": 0.3811626511752486,
          "rotation": 0,
          "target": "12-jst-13"
        },
        {
          "yaw": 1.6168841727040402,
          "pitch": 0.3404710970838334,
          "rotation": 0,
          "target": "13-jst-15"
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
        "yaw": 2.9060091817879536,
        "pitch": 0.04142275590623967,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.17519160422670765,
          "pitch": 0.328965898585718,
          "rotation": 0,
          "target": "13-jst-15"
        },
        {
          "yaw": 2.8761898270218165,
          "pitch": 0.31415109353537396,
          "rotation": 0,
          "target": "16-jst-17"
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
        "yaw": 1.9494710424531023,
        "pitch": 0.01283779305115118,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.167489682021202,
          "pitch": 0.337433761704645,
          "rotation": 0,
          "target": "15-jst-16"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.5074549095384882,
          "pitch": 0.1388845531824483,
          "title": "Office of Student Affairs and Services",
          "text": "It supervises student organizations and councils, coordinates scholarships and student services, and supports guidance, health, sports, and co-curricular activities that contribute to student development."
        }
      ]
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
        "yaw": 1.340023613857955,
        "pitch": -0.007163530426936404,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.6595716353102716,
          "pitch": 0.34671661243429597,
          "rotation": 0,
          "target": "3-jst-4"
        },
        {
          "yaw": 1.2945787999271268,
          "pitch": 0.26865973575959146,
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
        "yaw": 0.3544791153349749,
        "pitch": -0.007654016596619684,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.7429498338829816,
          "pitch": 0.32291003891297976,
          "rotation": 0,
          "target": "17-jst-18"
        },
        {
          "yaw": 0.32803114801242295,
          "pitch": 0.26511661056183655,
          "rotation": 0,
          "target": "20-jst-20"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "19-jst-21",
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
        "yaw": 1.3937791852158448,
        "pitch": -0.01578834496234549,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.2598268896975497,
          "pitch": 0.32387430909313686,
          "rotation": 0,
          "target": "22-jst-22"
        },
        {
          "yaw": -1.88,
          "pitch": 0.2758,
          "rotation": 0,
          "target": "20-jst-20"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "20-jst-20",
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
        "yaw": -0.6808151912089464,
        "pitch": -0.007632783023559853,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.7307404214992133,
          "pitch": 0.2757926290507431,
          "rotation": 0,
          "target": "19-jst-21"
        },
        {
          "yaw": 2.58,
          "pitch": 0.2651,
          "rotation": 0,
          "target": "18-jst-19"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "21-jst-23",
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
        "yaw": -1.0509155095778606,
        "pitch": 0.1524850941039535,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.0411108328564396,
          "pitch": 0.29869718054517236,
          "rotation": 0,
          "target": "22-jst-22"
        },
        {
          "yaw": -0.9390433797420545,
          "pitch": 0.49651698475107153,
          "rotation": 11.780972450961727,
          "target": "23-jst-24"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "22-jst-22",
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
        "yaw": 0.6576161278709485,
        "pitch": -0.02268211978507928,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.464784088070875,
          "pitch": 0.30721829663947275,
          "rotation": 0,
          "target": "19-jst-21"
        },
        {
          "yaw": 0.6839110444465781,
          "pitch": 0.31960124365246223,
          "rotation": 0.7853981633974483,
          "target": "21-jst-23"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.8409980940602075,
          "pitch": 0.057416148022383595,
          "title": "Office of the Auditor",
          "text": "It ensures that funds are used in accordance with government accounting and auditing rules, checks the accuracy of disbursements and reports, and promotes transparency and accountability in university operations. This function is carried out in coordination with the Commission on Audit (COA), which conducts annual audits of the university."
        }
      ]
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
        "yaw": 2.5563688566244442,
        "pitch": 0.018346382431744246,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.0268178590815502,
          "pitch": 0.49793534733257516,
          "rotation": 0,
          "target": "21-jst-23"
        },
        {
          "yaw": 2.575488507945111,
          "pitch": 0.2849307817318092,
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
        "yaw": 0.4737559098612216,
        "pitch": -0.0902590070274023,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.673110609435085,
          "pitch": 0.28791832019696884,
          "rotation": 0,
          "target": "23-jst-24"
        },
        {
          "yaw": 0.4680190825989339,
          "pitch": 0.24163110468273175,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 2.535635731705293,
          "pitch": 0.46687731652229125,
          "rotation": 0,
          "target": "26-jst-27"
        },
        {
          "yaw": -0.6348364858497515,
          "pitch": 0.28255007706624014,
          "rotation": 0,
          "target": "69-jst-71"
        },
        {
          "yaw": 0.98,
          "pitch": 0.2416,
          "rotation": 0,
          "target": "24-jst-25"
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
        "yaw": -0.8778952914869969,
        "pitch": 0.019388337373154485,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.33661215179594,
          "pitch": 0.5697168974601468,
          "rotation": 0,
          "target": "25-jst-26"
        },
        {
          "yaw": -1.0452028821849222,
          "pitch": 0.3030416803204794,
          "rotation": 0,
          "target": "27-jst-28"
        },
        {
          "yaw": 0.6896219366084093,
          "pitch": 0.39991173854968665,
          "rotation": 0,
          "target": "44-jst-45"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -2.550823678906747,
          "pitch": 0.1447126907192935,
          "title": "Administrative Office",
          "text": "It handles records and correspondence, personnel and human resource concerns, procurement and supply, property and facilities, and other general services that support the academic and administrative units of the university."
        }
      ]
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
        "yaw": 2.489221416244021,
        "pitch": 0.017237424011977254,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.5889812017382567,
          "pitch": 0.327361059216436,
          "rotation": 0,
          "target": "26-jst-27"
        },
        {
          "yaw": 2.4500212475228196,
          "pitch": 0.3376363522589134,
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
        "yaw": -1.4486827651454277,
        "pitch": 0.04783516910068997,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.7635185770160007,
          "pitch": 0.2949153795478203,
          "rotation": 0,
          "target": "27-jst-28"
        },
        {
          "yaw": 0.17196080598363395,
          "pitch": 0.3161133668991063,
          "rotation": 0,
          "target": "29-jst-30"
        },
        {
          "yaw": -1.3889208458436233,
          "pitch": 0.3364510136469896,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.9389829925495263,
          "pitch": 0.3118030528014444,
          "rotation": 0,
          "target": "28-jst-29"
        },
        {
          "yaw": 0.3501415589932986,
          "pitch": 0.2791344733231078,
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
        "yaw": -0.4685540357212723,
        "pitch": -0.01122273201612245,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.6896738414530352,
          "pitch": 0.23723353955038817,
          "rotation": 0,
          "target": "29-jst-30"
        },
        {
          "yaw": -0.41024845990584424,
          "pitch": 0.32118835105373833,
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
        "yaw": -2.894641046355849,
        "pitch": 0.007858835226057792,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.2550164978754381,
          "pitch": 0.22554647593967303,
          "rotation": 0,
          "target": "30-jst-31"
        },
        {
          "yaw": -2.90897092005968,
          "pitch": 0.27798528006268874,
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
        "yaw": -2.835394971367716,
        "pitch": -0.015437306118217364,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.24844927038502185,
          "pitch": 0.27149622370301607,
          "rotation": 0,
          "target": "31-jst-32"
        },
        {
          "yaw": -2.7272956019049435,
          "pitch": 0.2614112899319938,
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
        "yaw": -1.9203943575233247,
        "pitch": -0.04674548941800438,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.2202293793961765,
          "pitch": 0.28115771792959166,
          "rotation": 0,
          "target": "32-jst-33"
        },
        {
          "yaw": -1.8143253911094952,
          "pitch": 0.35419525015353237,
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
        "yaw": 1.9506362297795583,
        "pitch": -0.03952347871984507,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.9007700923726816,
          "pitch": 0.4127479613490195,
          "rotation": 0,
          "target": "35-jst-36"
        },
        {
          "yaw": -1.07,
          "pitch": 0.3,
          "rotation": 0,
          "target": "33-jst-34"
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
        "yaw": 0.26588936253925155,
        "pitch": 0.021680105151880014,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.8114969211933456,
          "pitch": 0.4156243827499111,
          "rotation": 0,
          "target": "34-jst-35"
        },
        {
          "yaw": 1.8182263108278711,
          "pitch": 0.3435930095135262,
          "rotation": 0,
          "target": "36-jst-37"
        },
        {
          "yaw": -1.2189810151682074,
          "pitch": 0.45147528477176024,
          "rotation": 0,
          "target": "61-jst-64"
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
        "yaw": 1.7906449034113132,
        "pitch": 0.06867990280136027,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.2723057344646236,
          "pitch": 0.3602250931579949,
          "rotation": 0,
          "target": "35-jst-36"
        },
        {
          "yaw": 1.710496534060848,
          "pitch": 0.3283731510544001,
          "rotation": 0,
          "target": "37-jst-38"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.2495860719542442,
          "pitch": 0.052331835515792235,
          "title": "Accounting Office",
          "text": "It processes disbursements and payroll, prepares financial statements and reports required by government agencies, and ensures that all transactions follow government accounting rules and budgetary guidelines."
        }
      ]
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
        "yaw": -2.803077270404767,
        "pitch": 0.14935167513768377,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.4743629004889236,
          "pitch": 0.3326333200507925,
          "rotation": 0,
          "target": "36-jst-37"
        },
        {
          "yaw": -1.1752736882848218,
          "pitch": 0.30041574392607195,
          "rotation": 0,
          "target": "38-jst-39"
        },
        {
          "yaw": -2.751550279889182,
          "pitch": 0.46790330541761804,
          "rotation": 0,
          "target": "63-jst-65"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.0140521374017553,
          "pitch": 0.14286913691302594,
          "title": "Accounting Office",
          "text": "It processes disbursements and payroll, prepares financial statements and reports required by government agencies, and ensures that all transactions follow government accounting rules and budgetary guidelines."
        }
      ]
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
        "yaw": -2.748320403389844,
        "pitch": 0.017533758857876336,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.5523213358854839,
          "pitch": 0.2984991683457263,
          "rotation": 0,
          "target": "37-jst-38"
        },
        {
          "yaw": -2.524169429597377,
          "pitch": 0.28714615980053537,
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
        "yaw": 2.8014884057862073,
        "pitch": 0.03747451315950556,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.4251567160542482,
          "pitch": 0.2989546423611422,
          "rotation": 0,
          "target": "38-jst-39"
        },
        {
          "yaw": 2.9759929263015454,
          "pitch": 0.2836926679804783,
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
        "yaw": -0.9392575295212104,
        "pitch": 0.02960191150756586,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.3318364439817163,
          "pitch": 0.36396919681801876,
          "rotation": 0,
          "target": "39-jst-40"
        },
        {
          "yaw": -0.8354543383716866,
          "pitch": 0.351825239960851,
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
        "yaw": 1.3559680523388735,
        "pitch": 0.02820607734555125,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.7599418476625672,
          "pitch": 0.37058297995572254,
          "rotation": 0,
          "target": "40-jst-41"
        },
        {
          "yaw": 2.8517621472355117,
          "pitch": 0.2613804663788546,
          "rotation": 0,
          "target": "42-jst-43"
        },
        {
          "yaw": 1.4005968651849532,
          "pitch": 0.3143023035766195,
          "rotation": 0,
          "target": "43-jst-44"
        },
        {
          "yaw": -0.19173980552628578,
          "pitch": 0.2681528756887186,
          "rotation": 0,
          "target": "67-jst-69"
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
        "yaw": 1.1805790256439703,
        "pitch": 0.055683648488585646,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.9883963986087867,
          "pitch": 0.3524725371855695,
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
        "yaw": -3.0407261781912283,
        "pitch": 0.02200917607963504,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.10738208052230469,
          "pitch": 0.29060339888187947,
          "rotation": 0,
          "target": "41-jst-42"
        },
        {
          "yaw": -3.0389785865825782,
          "pitch": 0.27533140740327333,
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
        "yaw": 2.7047669775563783,
        "pitch": 0.0853489328135808,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.43621194647537287,
          "pitch": 0.3266518592480878,
          "rotation": 0,
          "target": "43-jst-44"
        },
        {
          "yaw": 2.6484214071398338,
          "pitch": 0.325127043420558,
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
        "yaw": 1.6646178467219208,
        "pitch": -0.02338353051248987,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.229711500141704,
          "pitch": 0.4794117633515871,
          "rotation": 0,
          "target": "28-jst-29"
        },
        {
          "yaw": 1.561853748043264,
          "pitch": 0.26902344916605436,
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
        "yaw": 1.937827463183499,
        "pitch": -0.0440646591301217,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.1688411437689936,
          "pitch": 0.2209413312595867,
          "rotation": 0,
          "target": "45-jst-46"
        },
        {
          "yaw": 1.9776420649100945,
          "pitch": 0.271675441159406,
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
        "yaw": -2.3267697697486014,
        "pitch": -0.03970197398233033,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.0273779864358819,
          "pitch": 0.28192251831162096,
          "rotation": 0,
          "target": "46-jst-47"
        },
        {
          "yaw": -2.5090927386855366,
          "pitch": 0.260913174177162,
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
        "yaw": 1.8624334557739637,
        "pitch": -0.03903390321148237,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.1954852693146805,
          "pitch": 0.2296397373404382,
          "rotation": 0,
          "target": "47-jst-48"
        },
        {
          "yaw": 1.8385094276326166,
          "pitch": 0.24926426481490793,
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
        "yaw": -2.2850992878243,
        "pitch": -0.03216520735059447,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.9101699466293471,
          "pitch": 0.23842031754050375,
          "rotation": 0,
          "target": "48-jst-49"
        },
        {
          "yaw": -2.2314495505802725,
          "pitch": 0.34168534940291195,
          "rotation": 1.5707963267948966,
          "target": "51-jst-51"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "50-jst-52",
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
        "yaw": -1.2727201596148348,
        "pitch": 0.0023625280787236136,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.8930780725617868,
          "pitch": 0.47935556175935545,
          "rotation": 0,
          "target": "51-jst-51"
        },
        {
          "yaw": -1.2938139857954152,
          "pitch": 0.24885368198977886,
          "rotation": 0,
          "target": "52-jst-53"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "51-jst-51",
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
        "yaw": 2.275216739973917,
        "pitch": 0.03033371139339458,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.39781435405531,
          "pitch": 0.3189196658273463,
          "rotation": 0,
          "target": "49-jst-50"
        },
        {
          "yaw": 2.263763004642165,
          "pitch": 0.23875011685754544,
          "rotation": 0,
          "target": "50-jst-52"
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
        "yaw": -2.7773708671615918,
        "pitch": 0.006087291165975728,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.39032434874269306,
          "pitch": 0.2584557560183516,
          "rotation": 0,
          "target": "50-jst-52"
        },
        {
          "yaw": -2.8045628037965464,
          "pitch": 0.24933719553395584,
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
        "yaw": -0.8407856133917537,
        "pitch": 0.008027532943803095,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.3640091446378957,
          "pitch": 0.28525265434702796,
          "rotation": 0,
          "target": "52-jst-53"
        },
        {
          "yaw": -0.9210046236099814,
          "pitch": 0.2389820715221891,
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
        "yaw": 1.0451091814343272,
        "pitch": 0.006072496787229653,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.0178341038424605,
          "pitch": 0.2569484544800158,
          "rotation": 0,
          "target": "53-jst-54"
        },
        {
          "yaw": 1.1339032956799784,
          "pitch": 0.2887834184391309,
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
        "yaw": 1.1495979125622657,
        "pitch": 0.008181082177220134,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.1495976586115546,
          "pitch": 0.3374411480618722,
          "rotation": 0,
          "target": "56-jst-58"
        },
        {
          "yaw": -1.9860402934067132,
          "pitch": 0.30049143140612955,
          "rotation": 0,
          "target": "54-jst-56"
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
        "yaw": -0.466723444513816,
        "pitch": 0.09642501925937097,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.4339480391294366,
          "pitch": 0.26066356979126226,
          "rotation": 0,
          "target": "57-jst-59"
        },
        {
          "yaw": -1.1767050697117423,
          "pitch": 0.3313946186182477,
          "rotation": 0,
          "target": "103-jst-107"
        },
        {
          "yaw": 2.02,
          "pitch": 0.3,
          "rotation": 0,
          "target": "55-jst-57"
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
        "yaw": -2.7286533912432827,
        "pitch": -0.01655476780289078,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.5747632593529985,
          "pitch": 0.30793136710044067,
          "rotation": 0,
          "target": "56-jst-58"
        },
        {
          "yaw": -2.6395065726278197,
          "pitch": 0.23438995810274932,
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
        "yaw": 3.009653074353632,
        "pitch": -0.13541898954981058,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.031762681582129915,
          "pitch": 0.3148292295897157,
          "rotation": 0,
          "target": "57-jst-59"
        },
        {
          "yaw": 3.03999198222893,
          "pitch": 0.17841221496114734,
          "rotation": 0,
          "target": "59-jst-61"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.0518822757047896,
          "pitch": 0.1245685850773981,
          "title": "Information and Communications Technology Services Office",
          "text": "It maintains the network and internet connectivity, oversees hardware and software resources, supports the university's information systems and website, and provides technical assistance to students, faculty, and staff."
        }
      ]
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
        "yaw": 0.6133581799349734,
        "pitch": -0.002991174329148194,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.6369051046476741,
          "pitch": 0.20594451692907967,
          "rotation": 0,
          "target": "60-jst-62"
        },
        {
          "yaw": -2.4275201999018883,
          "pitch": 0.2657650948719521,
          "rotation": 0,
          "target": "58-jst-60"
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
        "yaw": -0.32893534239860145,
        "pitch": -0.05560252414440292,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.90912573800023,
          "pitch": 0.252924809558035,
          "rotation": 0,
          "target": "59-jst-61"
        },
        {
          "yaw": -0.3294486648728423,
          "pitch": 0.24869503192724096,
          "rotation": 0,
          "target": "62-jst-63"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -1.8260575081642045,
          "pitch": 0.024504524640803993,
          "title": "Quality Assurance Center",
          "text": "It prepares the university for accreditation and certification, monitors compliance with CHED and ISO requirements, conducts internal quality audits, and leads continual improvement efforts across academic and administrative units."
        }
      ]
    },
    {
      "id": "61-jst-64",
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.4752677987639427,
          "pitch": 0.25684949198832285,
          "rotation": 0,
          "target": "62-jst-63"
        },
        {
          "yaw": 0.6534022430890847,
          "pitch": 0.4670531439188359,
          "rotation": 0,
          "target": "35-jst-36"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.9395283002428254,
          "pitch": 0.17293999430146023,
          "title": "Internal Audit Office",
          "text": " It evaluates compliance with policies, laws, and government regulations, assesses the efficiency of financial and administrative processes, and recommends improvements to management to strengthen accountability and reduce risk."
        }
      ]
    },
    {
      "id": "62-jst-63",
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
        "yaw": 1.5168421013764544,
        "pitch": 0.042507370781313725,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.5815827055959453,
          "pitch": 0.29768709832340967,
          "rotation": 0,
          "target": "60-jst-62"
        },
        {
          "yaw": 1.4630960441470373,
          "pitch": 0.35004853455232166,
          "rotation": 0,
          "target": "61-jst-64"
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
        "yaw": 2.2737389424108834,
        "pitch": 0.04540929729300558,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.8293057314503169,
          "pitch": 0.3146997855281022,
          "rotation": 0,
          "target": "37-jst-38"
        },
        {
          "yaw": 2.2293624932251923,
          "pitch": 0.3834739216709675,
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
        "yaw": 1.723125128165174,
        "pitch": -0.01341315462731174,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.3843513073467157,
          "pitch": 0.21635547908627828,
          "rotation": 0,
          "target": "63-jst-65"
        },
        {
          "yaw": 0.17823794246358737,
          "pitch": 0.224493425953737,
          "rotation": 0,
          "target": "65-jst-67"
        },
        {
          "yaw": -2.9595681458839973,
          "pitch": 0.24103730663658318,
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
        "yaw": -0.8708081532370535,
        "pitch": -0.08423155300149432,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.4216020585911613,
          "pitch": 0.23185402080187778,
          "rotation": 0,
          "target": "64-jst-66"
        },
        {
          "yaw": -0.7519838607383758,
          "pitch": 0.19523211941523044,
          "rotation": 0,
          "target": "90-jst-94"
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
        "yaw": 1.5384738486659204,
        "pitch": -0.08170716796833766,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.5394062337384966,
          "pitch": 0.27835530964851785,
          "rotation": 0,
          "target": "64-jst-66"
        },
        {
          "yaw": 1.550063508130342,
          "pitch": 0.15806824711574663,
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
        "yaw": 1.4029437549739185,
        "pitch": -0.07659037974463345,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.807611088907013,
          "pitch": 0.1789427605338343,
          "rotation": 0,
          "target": "66-jst-68"
        },
        {
          "yaw": 2.9172735670094454,
          "pitch": 0.06953307607122916,
          "rotation": 0,
          "target": "41-jst-42"
        },
        {
          "yaw": 1.4693857864925253,
          "pitch": 0.15824602163441526,
          "rotation": 0,
          "target": "68-jst-70"
        },
        {
          "yaw": -0.1843403382363249,
          "pitch": 0.16450286339291154,
          "rotation": 0,
          "target": "70-jst-72"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.9180472403628706,
          "pitch": -0.2412876406220672,
          "title": "Administration Building",
          "text": "The Administration Building of Laguna State Polytechnic University houses the university's main administrative offices. It is where the offices of the campus director, registrar, accounting, cashier, human resources, and other support units are located, making it the central point for student and employee transactions such as enrollment, records requests, payments, and other official processes."
        }
      ]
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
        "yaw": -0.8104517302714545,
        "pitch": -0.04861834745714333,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.3170526207371838,
          "pitch": 0.19025771695850757,
          "rotation": 0,
          "target": "67-jst-69"
        },
        {
          "yaw": -0.8300136782547511,
          "pitch": 0.20385907717041718,
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
        "yaw": -2.98770670805537,
        "pitch": -0.023536196504387874,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.28030396332103713,
          "pitch": 0.1835496577393947,
          "rotation": 0,
          "target": "68-jst-70"
        },
        {
          "yaw": -1.3092206440303613,
          "pitch": 0.10023111444658817,
          "rotation": 0,
          "target": "25-jst-26"
        },
        {
          "yaw": 2.3325377821648186,
          "pitch": 0.28279980366236757,
          "rotation": 6.283185307179586,
          "target": "74-jst-76"
        },
        {
          "yaw": -2.6359053715924166,
          "pitch": 0.1721274263679895,
          "rotation": 0,
          "target": "87-jst-92"
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
          "yaw": -0.16412020889441337,
          "pitch": 0.10615365831889534,
          "rotation": 0,
          "target": "67-jst-69"
        },
        {
          "yaw": 2.9966449883670467,
          "pitch": 0.12545901206285848,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.233798976809295,
          "pitch": -1.3645661619978426,
          "rotation": 0,
          "target": "72-jst-74"
        },
        {
          "yaw": -1.7098097529069172,
          "pitch": 0.07505430613604247,
          "rotation": 0,
          "target": "73-jst-75"
        },
        {
          "yaw": 1.4429911974441154,
          "pitch": 0.16222482220790724,
          "rotation": 0,
          "target": "70-jst-72"
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
          "yaw": 1.23,
          "pitch": -1.3646,
          "rotation": 0,
          "target": "71-jst-73"
        }
      ],
      "infoHotspots": []
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
        "yaw": -2.3469647946264196,
        "pitch": -0.12740065666098133,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.8807868956946407,
          "pitch": 0.09344230893580985,
          "rotation": 0,
          "target": "71-jst-73"
        },
        {
          "yaw": -2.247926910769669,
          "pitch": -0.03041437242685774,
          "rotation": 0,
          "target": "204-jst-212"
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
        "yaw": 0.3758711536099355,
        "pitch": -0.07348324750469004,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.6614667287323677,
          "pitch": 0.2869584656222166,
          "rotation": 0,
          "target": "69-jst-71"
        },
        {
          "yaw": 0.3700820205253912,
          "pitch": 0.1966388779071533,
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
        "yaw": -0.6442665727197081,
        "pitch": 0.017809827054996674,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.523028760764559,
          "pitch": 0.22613462478651414,
          "rotation": 0,
          "target": "74-jst-76"
        },
        {
          "yaw": -0.5409903683556312,
          "pitch": 0.29734393676883997,
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
        "yaw": -2.4432671787995055,
        "pitch": -0.045446944555580515,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.7137732936250689,
          "pitch": 0.12424284999151425,
          "rotation": 0,
          "target": "77-jst-79"
        },
        {
          "yaw": 0.88,
          "pitch": 0.2973,
          "rotation": 0,
          "target": "75-jst-77"
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
        "yaw": -0.4469967947504436,
        "pitch": 0.0305212664209904,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.7916122732817685,
          "pitch": 0.3782778415097958,
          "rotation": 0,
          "target": "76-jst-78"
        },
        {
          "yaw": -0.4529238934654831,
          "pitch": 0.2111580620164517,
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
        "yaw": -0.2838877799800521,
        "pitch": 0.020965012664898808,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.940792391689727,
          "pitch": 0.25157140355916496,
          "rotation": 0,
          "target": "77-jst-79"
        },
        {
          "yaw": -0.13059659282330038,
          "pitch": 0.15089691348688206,
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
        "yaw": -0.14959965017095556,
        "pitch": -0.05597374217282436,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.07948200767754088,
          "pitch": 0.22165130736053484,
          "rotation": 0,
          "target": "80-jst-82"
        },
        {
          "yaw": 3.07,
          "pitch": 0.1509,
          "rotation": 0,
          "target": "78-jst-80"
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
        "yaw": -0.06402673898764988,
        "pitch": 0.01780982705498957,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.6066822463089334,
          "pitch": 0.24691525246286083,
          "rotation": 0,
          "target": "81-jst-84"
        },
        {
          "yaw": -3.11,
          "pitch": 0.2217,
          "rotation": 0,
          "target": "79-jst-81"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.5051569045490485,
          "pitch": 0.18699738047794945,
          "title": "University Library",
          "text": "It maintains collections of books, periodicals, theses, and digital resources, provides access to online databases and the library website, and offers reading and research spaces along with assistance in locating and using information materials."
        }
      ]
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
        "yaw": -0.7705922828763541,
        "pitch": -0.06645375716014357,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.533741612650674,
          "pitch": 0.058831307096752994,
          "rotation": 0,
          "target": "80-jst-82"
        },
        {
          "yaw": 1.038399562756961,
          "pitch": 0.11639575490060672,
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
        "yaw": 2.1767951566168957,
        "pitch": -0.01032724825034137,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.2501184514938446,
          "pitch": 0.22210182333434503,
          "rotation": 0.7853981633974483,
          "target": "83-jst-86"
        },
        {
          "yaw": -1.56,
          "pitch": 0.1164,
          "rotation": 0,
          "target": "81-jst-84"
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
        "yaw": 1.8965332640778838,
        "pitch": -0.07905449705797096,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.7341655495731931,
          "pitch": 0.26909962583067326,
          "rotation": 5.497787143782138,
          "target": "82-jst-85"
        },
        {
          "yaw": 1.9436597812240226,
          "pitch": 0.17563985012372108,
          "rotation": 0,
          "target": "84-jst-87"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.41445949348996614,
          "pitch": 0.023732713303704855,
          "title": "General Service Office Building",
          "text": "The General Services Office Building of Laguna State Polytechnic University houses the unit responsible for the upkeep of the campus. It oversees building and grounds maintenance, repairs of facilities and utilities, janitorial and sanitation services, transportation and motor pool, and other support services that keep the university's physical environment functional and well maintained."
        }
      ]
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
        "yaw": -3.045282059100579,
        "pitch": -0.06017234462860088,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.16500965039747761,
          "pitch": 0.20259999840627785,
          "rotation": 0,
          "target": "83-jst-86"
        },
        {
          "yaw": -3.0045761888288247,
          "pitch": 0.1739055753882397,
          "rotation": 0,
          "target": "85-jst-89"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.7064033653550945,
          "pitch": -0.013496581686066378,
          "title": "Supreme Student Council",
          "text": "The Supreme Student Council of Laguna State Polytechnic University is the highest governing student body on the campus. Composed of elected student officers, it represents the students before the administration, voices student concerns and welfare issues, and organizes activities and programs for the student community. The local councils of each campus are federated under the Federated Supreme Student Council, which represents students at the university level."
        }
      ]
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
        "yaw": 2.3333204734026474,
        "pitch": -0.07550504909563571,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.7876165897848999,
          "pitch": 0.2615405740173351,
          "rotation": 0,
          "target": "84-jst-87"
        },
        {
          "yaw": 3.127255151348723,
          "pitch": 0.32691177248211645,
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
        "yaw": -2.940331905684893,
        "pitch": -0.10201091606814217,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.92302702557544,
          "pitch": 0.1516022736146585,
          "rotation": 0,
          "target": "88-jst-91"
        },
        {
          "yaw": 1.8976287713573061,
          "pitch": 0.20955757129899766,
          "rotation": 0,
          "target": "3-jst-4"
        },
        {
          "yaw": -0.45,
          "pitch": 0.3,
          "rotation": 0,
          "target": "85-jst-89"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "87-jst-92",
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
        "yaw": 2.022316788628774,
        "pitch": -0.045887192053552184,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.069006605250264,
          "pitch": 0.15490013119929458,
          "rotation": 0,
          "target": "88-jst-91"
        },
        {
          "yaw": 2.1386955127203766,
          "pitch": 0.14515678699099865,
          "rotation": 0,
          "target": "69-jst-71"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "88-jst-91",
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
        "yaw": 1.24054130859178,
        "pitch": -0.0439619523816539,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.3204232797317168,
          "pitch": 0.13118849212224148,
          "rotation": 0,
          "target": "87-jst-92"
        },
        {
          "yaw": -1.88,
          "pitch": 0.1516,
          "rotation": 0,
          "target": "86-jst-90"
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [],
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.269905477286425,
          "pitch": 0.1774880793701641,
          "rotation": 0,
          "target": "65-jst-67"
        },
        {
          "yaw": 2.4041479301646724,
          "pitch": 0.1632784654134536,
          "rotation": 0,
          "target": "92-jst-95"
        },
        {
          "yaw": 0.9295119198858757,
          "pitch": 0.1646007690382909,
          "rotation": 0,
          "target": "95-jst-99"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "91-jst-96",
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
        "yaw": 2.3686481947175855,
        "pitch": -0.04151597899569737,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.6962935657020779,
          "pitch": 0.1855572161351855,
          "rotation": 0,
          "target": "92-jst-95"
        },
        {
          "yaw": 2.427016537674743,
          "pitch": 0.17281725652859592,
          "rotation": 0,
          "target": "93-jst-97"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.433356931547509,
          "pitch": -0.017917788535768864,
          "title": "University Gymnasium",
          "text": "It hosts training and competitions for varsity teams and intramural events, and is also used for ceremonies, convocations, orientations, and other university-wide activities that require a large assembly space."
        }
      ]
    },
    {
      "id": "92-jst-95",
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
        "yaw": 2.2601546090698648,
        "pitch": 0.01890022462978891,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.07050432387980088,
          "pitch": 0.1672806397338391,
          "rotation": 0,
          "target": "90-jst-94"
        },
        {
          "yaw": 2.2661463042849874,
          "pitch": 0.23170152624480167,
          "rotation": 0,
          "target": "91-jst-96"
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
        "yaw": 0.5734005479513602,
        "pitch": -0.017978231455048288,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.635045953782573,
          "pitch": 0.21205904053711322,
          "rotation": 0,
          "target": "91-jst-96"
        },
        {
          "yaw": 0.6099229549423306,
          "pitch": 0.08242601346439393,
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
        "yaw": 0.6024177795508923,
        "pitch": -0.039189795848576736,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.5342131000359647,
          "pitch": 0.05423627117908225,
          "rotation": 0,
          "target": "93-jst-97"
        },
        {
          "yaw": 1.6326468859787209,
          "pitch": 0.20234314703344936,
          "rotation": 0.7853981633974483,
          "target": "187-jst-195"
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
        "yaw": -2.5676486277244166,
        "pitch": 0.06174379248450812,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.6701557280145725,
          "pitch": 0.20545110107537212,
          "rotation": 0,
          "target": "90-jst-94"
        },
        {
          "yaw": -2.933625355869726,
          "pitch": 0.16515429193713516,
          "rotation": 0,
          "target": "96-jst-100"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.2,
          "pitch": -0.12,
          "title": "Business Affairs Office",
          "text": "Manages the university's financial operations, procurement, and business transactions."
        }
      ]
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
        "yaw": 0.673198425769229,
        "pitch": -0.02035408806284522,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.2889233106608664,
          "pitch": 0.18389233829022444,
          "rotation": 0.7853981633974483,
          "target": "119-jst-124"
        },
        {
          "yaw": 0.2087956226216523,
          "pitch": 0.15516458149025425,
          "rotation": 0,
          "target": "97-jst-101"
        },
        {
          "yaw": -2.27,
          "pitch": 0.1652,
          "rotation": 0,
          "target": "95-jst-99"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -1.29,
          "pitch": -0.2,
          "title": "Business Affairs Office",
          "text": "Manages the university's financial operations, procurement, and business transactions."
        }
      ]
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
        "yaw": 0.750803790443122,
        "pitch": -0.05897766505570701,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.363804438691302,
          "pitch": 0.21483561255554484,
          "rotation": 0,
          "target": "96-jst-100"
        },
        {
          "yaw": 2.2343679609627944,
          "pitch": 0.25038463010107215,
          "rotation": 0,
          "target": "119-jst-124"
        },
        {
          "yaw": 0.640393214251441,
          "pitch": 0.17124088440215246,
          "rotation": 0,
          "target": "99-jst-102"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -1.15,
          "pitch": -0.12,
          "title": "Business Affairs Office",
          "text": "Manages the university's financial operations, procurement, and business transactions."
        }
      ]
    },
    {
      "id": "98-jst-103",
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
        "yaw": -0.38290386650895414,
        "pitch": -0.06615078620424697,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.4324775811496302,
          "pitch": 0.10579570502912006,
          "rotation": 0,
          "target": "100-jst-104"
        },
        {
          "yaw": 2.69,
          "pitch": 0.1224,
          "rotation": 0,
          "target": "99-jst-102"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "99-jst-102",
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
        "yaw": 0.2914793858561815,
        "pitch": -0.061062264188535664,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.8583594350957497,
          "pitch": 0.12084054816930134,
          "rotation": 0,
          "target": "97-jst-101"
        },
        {
          "yaw": 0.29731525478956655,
          "pitch": 0.12242565411415107,
          "rotation": 0,
          "target": "98-jst-103"
        },
        {
          "yaw": 2.29,
          "pitch": 0.1676,
          "rotation": 0,
          "target": "119-jst-124"
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
        "yaw": -0.507570241651397,
        "pitch": -0.10685896232993741,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.742887022846732,
          "pitch": 0.14713696755271144,
          "rotation": 0,
          "target": "98-jst-103"
        },
        {
          "yaw": -0.4329494762017596,
          "pitch": 0.16826859658865345,
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
        "yaw": -0.42386567548434684,
        "pitch": -0.08204971581206166,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.8525163652030443,
          "pitch": 0.16714571208326845,
          "rotation": 0,
          "target": "102-jst-106"
        },
        {
          "yaw": -0.3542544133374115,
          "pitch": 0.14788731208808414,
          "rotation": 0,
          "target": "104-jst-108"
        },
        {
          "yaw": 2.8268645166344983,
          "pitch": 0.1814722150246766,
          "rotation": 0,
          "target": "100-jst-104"
        },
        {
          "yaw": 1.2692226601379435,
          "pitch": 0.16109074176386784,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.7703496411090054,
          "pitch": 0.383597489686089,
          "rotation": 0,
          "target": "101-jst-105"
        },
        {
          "yaw": -1.3046722350799165,
          "pitch": 0.23408258299174634,
          "rotation": 0,
          "target": "103-jst-107"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.00782831008699958,
          "pitch": 0.2026886425318004,
          "title": "Student Organization of the College of Computer Studies",
          "text": "The student organization of the College of Computer Studies serves as the recognized student body representing IT and computer science students of the college. It organizes seminars, trainings, competitions, and other academic and social activities, represents student interests before the college administration and the supreme student council, and helps build camaraderie and professional growth among its members."
        }
      ]
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
        "yaw": -0.8194905158670736,
        "pitch": -0.02035408806284522,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.3006322541250483,
          "pitch": 0.2302782162635797,
          "rotation": 0,
          "target": "102-jst-106"
        },
        {
          "yaw": -0.6915530515794952,
          "pitch": 0.27162144536389476,
          "rotation": 0,
          "target": "56-jst-58"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.7392241165647366,
          "pitch": 0.1868402371737634,
          "title": "College of Computer Studies",
          "text": "The College of Computer Studies (CCS) of Laguna State Polytechnic University offers degree programs in information technology and computer science. It trains students in programming, networking, database systems, systems development, and emerging technologies, and engages in research and extension projects that apply computing solutions to real community and industry needs."
        }
      ]
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
        "yaw": 1.2473600099279096,
        "pitch": -0.021651377153657947,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.3030626660776043,
          "pitch": 0.15874645664714926,
          "rotation": 0,
          "target": "105-jst-109"
        },
        {
          "yaw": -1.8527412820272637,
          "pitch": 0.16607510186527286,
          "rotation": 0,
          "target": "101-jst-105"
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
        "yaw": 0.5258188414089702,
        "pitch": -0.06869504721210262,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.6618674920173753,
          "pitch": 0.1888292566320402,
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
        "yaw": 0.7569789147321657,
        "pitch": -0.0010853623385784772,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.303705177859543,
          "pitch": 0.3084678534040144,
          "rotation": 0,
          "target": "101-jst-105"
        },
        {
          "yaw": 0.7296275377292769,
          "pitch": 0.540146138452057,
          "rotation": 10.995574287564278,
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
        "yaw": -0.03073874442199198,
        "pitch": 0,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.946243271244139,
          "pitch": 0.24366414706247852,
          "rotation": 0,
          "target": "110-jst-114"
        },
        {
          "yaw": -1.618311514104878,
          "pitch": 0.3668473437666826,
          "rotation": 0,
          "target": "106-jst-110"
        },
        {
          "yaw": -0.14420048628633175,
          "pitch": 0.2516184923632867,
          "rotation": 0,
          "target": "108-jst-112"
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
        "yaw": -1.078155696688441,
        "pitch": -0.022180968065203643,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.9719264961197043,
          "pitch": 0.3678251501946548,
          "rotation": 0,
          "target": "107-jst-111"
        },
        {
          "yaw": -1.151203421891708,
          "pitch": 0.2663130216781635,
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
          "yaw": 0.8605678290384216,
          "pitch": 0.2051650213001217,
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
        "yaw": 1.4848682254586887,
        "pitch": 0.045730801781514785,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.6307830670912216,
          "pitch": 0.26394992666856965,
          "rotation": 0,
          "target": "111-jst-115"
        },
        {
          "yaw": -1.56,
          "pitch": 0.2437,
          "rotation": 0,
          "target": "107-jst-111"
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
        "yaw": 1.4760125194316887,
        "pitch": 0.07645572175565185,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.618915409957479,
          "pitch": 0.2145883766456187,
          "rotation": 0,
          "target": "110-jst-114"
        },
        {
          "yaw": -0.04041768934115275,
          "pitch": 0.10689392352114169,
          "rotation": 0,
          "target": "112-jst-116"
        },
        {
          "yaw": 1.4648075388515025,
          "pitch": 0.2239237677735133,
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
        "yaw": -2.9059973902850658,
        "pitch": 0.5126119310890314,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.448821912644564,
          "pitch": 0.6505245907113064,
          "rotation": 0,
          "target": "111-jst-115"
        },
        {
          "yaw": -2.0463609991563043,
          "pitch": 0.5904432353999987,
          "rotation": 10.995574287564278,
          "target": "114-jst-117"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "113-jst-118",
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.3759611932096867,
          "pitch": 0.3226264424740819,
          "rotation": 0,
          "target": "114-jst-117"
        },
        {
          "yaw": 2.3716452032042854,
          "pitch": 0.22261264976949313,
          "rotation": 0,
          "target": "115-jst-119"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.8495087755924065,
          "pitch": 0.13268594284706836,
          "title": "Office of the Campus Director",
          "text": "It implements university policies at the campus level, supervises academic and administrative units and their personnel, manages campus resources and facilities, and represents the campus in coordination with the Office of the University President and external partners."
        }
      ]
    },
    {
      "id": "114-jst-117",
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
          "yaw": -0.1227882124062667,
          "pitch": 0.2151353277101986,
          "rotation": 0,
          "target": "113-jst-118"
        },
        {
          "yaw": -1.2961591871504314,
          "pitch": 0.6275759354314978,
          "rotation": 1.5707963267948966,
          "target": "112-jst-116"
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
        "yaw": 1.4302672479748093,
        "pitch": -0.022227141213569723,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.7940297207690925,
          "pitch": 0.22771051815790244,
          "rotation": 0,
          "target": "113-jst-118"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -2.8744879957416902,
          "pitch": 0.1178618355489931,
          "title": "Records Management Office",
          "text": "It receives, files, and releases communications, maintains records retention and disposal in line with government requirements, and ensures that documents are secure, organized, and readily available when needed by university offices."
        },
        {
          "yaw": 2.547197706074998,
          "pitch": 0.13107135373080325,
          "title": "International Affairs Office",
          "text": "It facilitates international partnerships and memoranda of agreement, coordinates student and faculty exchange, study tours, and collaborative research, and assists foreign students and visiting scholars with their concerns at the university."
        }
      ]
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
        "yaw": -2.4115346743420467,
        "pitch": 0.014616327961123332,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.2907745714556214,
          "pitch": 0.3161799750798693,
          "rotation": 0,
          "target": "117-jst-121"
        },
        {
          "yaw": 0.79,
          "pitch": 0.2239,
          "rotation": 0,
          "target": "111-jst-115"
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
        "yaw": -2.8717494330013196,
        "pitch": 0.01934593330198453,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.38383298813924327,
          "pitch": 0.22813052944495915,
          "rotation": 0,
          "target": "116-jst-120"
        },
        {
          "yaw": -2.802709578352454,
          "pitch": 0.39322854496995063,
          "rotation": 0,
          "target": "118-jst-122"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "118-jst-122",
      "name": "JST-122",
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
          "yaw": -0.2671746514025859,
          "pitch": 0.227028181944819,
          "rotation": 0,
          "target": "117-jst-121"
        },
        {
          "yaw": 2.752185225834486,
          "pitch": 0.3158989583225953,
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
        "yaw": 2.275306717362805,
        "pitch": -0.007002157223656269,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.5286684223846372,
          "pitch": 0.2063654435761606,
          "rotation": 0,
          "target": "118-jst-122"
        },
        {
          "yaw": -2.400019682821675,
          "pitch": 0.13447248483121577,
          "rotation": 0,
          "target": "120-jst-125"
        },
        {
          "yaw": 2.205101917431305,
          "pitch": 0.1649127780002253,
          "rotation": 0,
          "target": "130-jst-135"
        },
        {
          "yaw": -1.9052337037339875,
          "pitch": 0.13842332968022752,
          "rotation": 7.0685834705770345,
          "target": "95-jst-99"
        },
        {
          "yaw": -0.5156883355605366,
          "pitch": 0.16763761175616132,
          "rotation": 1.5707963267948966,
          "target": "99-jst-102"
        },
        {
          "yaw": -1.58,
          "pitch": 0.1839,
          "rotation": 0,
          "target": "96-jst-100"
        },
        {
          "yaw": -1.01,
          "pitch": 0.2504,
          "rotation": 0,
          "target": "97-jst-101"
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
        "yaw": -0.11932353049350652,
        "pitch": 0.061062264188535664,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.750639230178237,
          "pitch": 0.23258667214428996,
          "rotation": 0,
          "target": "119-jst-124"
        },
        {
          "yaw": -0.1402574643329082,
          "pitch": 0.2756272441821199,
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
        "yaw": -2.076929022589736,
        "pitch": 0.00435359119296308,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.119148643972343,
          "pitch": 0.15373964695850262,
          "rotation": 0,
          "target": "120-jst-125"
        },
        {
          "yaw": -2.0504443343737773,
          "pitch": 0.11290214838784252,
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
        "yaw": -1.3662112311239607,
        "pitch": 0.02501476956037152,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.7811580356030543,
          "pitch": 0.07831728568486795,
          "rotation": 0,
          "target": "121-jst-126"
        },
        {
          "yaw": -1.3817813286865892,
          "pitch": 0.23380845829042052,
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
        "yaw": -2.7822705065401436,
        "pitch": -0.007126968604382,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.44094632763811603,
          "pitch": 0.19265596338839508,
          "rotation": 0,
          "target": "122-jst-127"
        },
        {
          "yaw": -2.7616927260368556,
          "pitch": 0.2464577969714572,
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
        "yaw": -3.0978896868743533,
        "pitch": -0.065704986268738,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.15645979965032808,
          "pitch": 0.2277358183287923,
          "rotation": 0,
          "target": "123-jst-128"
        },
        {
          "yaw": -2.9433102431429745,
          "pitch": 0.2812905913814525,
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
        "yaw": 2.7765987292052294,
        "pitch": -0.005158571193152994,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.3310848436399585,
          "pitch": 0.28817420571783003,
          "rotation": 0,
          "target": "124-jst-129"
        },
        {
          "yaw": 2.7983413600474973,
          "pitch": 0.2920361399269389,
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
        "yaw": 2.1543586723338093,
        "pitch": -0.0303280135699886,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.9253231800490624,
          "pitch": 0.2030764114156085,
          "rotation": 0,
          "target": "125-jst-130"
        },
        {
          "yaw": 2.2374850356901543,
          "pitch": 0.10597941508406983,
          "rotation": 0,
          "target": "127-jst-132"
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
        "yaw": -2.3336182407641104,
        "pitch": -0.03708878220765399,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.9627667976137548,
          "pitch": 0.22637603947713103,
          "rotation": 0,
          "target": "126-jst-131"
        },
        {
          "yaw": -2.1988062388184204,
          "pitch": 0.09596815524042057,
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
        "yaw": -1.553293020256456,
        "pitch": -0.014956322629771535,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.7940442579187472,
          "pitch": 0.11976064461839897,
          "rotation": 0,
          "target": "127-jst-132"
        },
        {
          "yaw": -1.4477423953972082,
          "pitch": 0.24908943434832054,
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
        "yaw": -0.7933450770248545,
        "pitch": 0.06414210626268613,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.588234180924168,
          "pitch": 0.3729101018151155,
          "rotation": 0,
          "target": "162-jst-169"
        },
        {
          "yaw": 2.4838812314243395,
          "pitch": 0.07011920318994314,
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
        "yaw": 2.643534827540278,
        "pitch": 0.01590215537755668,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.5694514617653752,
          "pitch": 0.13781128292674794,
          "rotation": 0,
          "target": "119-jst-124"
        },
        {
          "yaw": 2.525982297944637,
          "pitch": 0.14955911322705617,
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
        "yaw": -2.1900658722303845,
        "pitch": -0.051449977456295315,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.1527771062444234,
          "pitch": 0.10770605379555676,
          "rotation": 0,
          "target": "130-jst-135"
        },
        {
          "yaw": -2.0857728927108,
          "pitch": 0.12542091368565522,
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
        "yaw": -1.4312290207698197,
        "pitch": -0.07132532251309343,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.8165329442104472,
          "pitch": 0.11620960056439245,
          "rotation": 0,
          "target": "131-jst-136"
        },
        {
          "yaw": -1.3747951344649927,
          "pitch": 0.1783336324047795,
          "rotation": 0,
          "target": "134-jst-139"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "133-jst-140",
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
        "yaw": -2.6457801670287786,
        "pitch": -0.033022949097240684,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.48314644159956543,
          "pitch": 0.2108353353928223,
          "rotation": 0,
          "target": "134-jst-139"
        },
        {
          "yaw": -2.6769676617428377,
          "pitch": 0.13028027147085552,
          "rotation": 0,
          "target": "135-jst-141"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "134-jst-139",
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.3982622732987089,
          "pitch": 0.1668131474919896,
          "rotation": 0,
          "target": "161-jst-166"
        },
        {
          "yaw": -1.965418387684613,
          "pitch": 0.12733021477315987,
          "rotation": 0,
          "target": "133-jst-140"
        },
        {
          "yaw": 2.62,
          "pitch": 0.1783,
          "rotation": 0,
          "target": "132-jst-138"
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
        "yaw": 2.6484912821659625,
        "pitch": -0.07046314515103802,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.5158341693328836,
          "pitch": 0.1829403768064637,
          "rotation": 0,
          "target": "133-jst-140"
        },
        {
          "yaw": 2.5306083677597977,
          "pitch": 0.1379460873193512,
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
        "yaw": -2.1843664199662918,
        "pitch": -0.034619210384288834,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.9221906428524456,
          "pitch": 0.1662687344914069,
          "rotation": 0,
          "target": "135-jst-141"
        },
        {
          "yaw": -2.1877834883211307,
          "pitch": 0.14673233273130393,
          "rotation": 0,
          "target": "137-jst-143"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.509643329786053,
          "pitch": 0.17434303535102735,
          "title": "LSPU Hotel",
          "text": "The LSPU training hotel serves as the laboratory facility of the hospitality and tourism management program. It provides students with hands-on experience in front office, housekeeping, food and beverage service, and guest relations in an actual hotel setting, and it also accommodates university guests and hosts functions and events held on campus"
        }
      ]
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
        "yaw": -1.44326938235902,
        "pitch": -0.10361907029159312,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.801530674852022,
          "pitch": 0.14155043030998016,
          "rotation": 0,
          "target": "136-jst-142"
        },
        {
          "yaw": -1.3858137042652388,
          "pitch": 0.11884501139210535,
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
        "yaw": -2.3134984206990907,
        "pitch": -0.0321747911713004,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.7853774973216261,
          "pitch": 0.13692868187923324,
          "rotation": 0,
          "target": "137-jst-143"
        },
        {
          "yaw": -2.4244219939569174,
          "pitch": 0.1362075624000152,
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
        "yaw": -2.951336199682494,
        "pitch": -0.00967017703166384,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -3.0777919660365534,
          "pitch": 0.1614241136762633,
          "rotation": 0,
          "target": "140-jst-146"
        },
        {
          "yaw": 0.3551095155747497,
          "pitch": 0.18146315877211094,
          "rotation": 0,
          "target": "138-jst-144"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.8004431738372313,
          "pitch": -0.0021830734637120486,
          "title": "Supply Office",
          "text": "It handles the receiving, storage, issuance, and inventory of supplies, maintains records of university property, and coordinates with the procurement and accounting units to ensure that offices and colleges receive the resources they need for their operations."
        }
      ]
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
        "yaw": 1.5149149749163087,
        "pitch": 0.024847116513711853,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.56103342699069,
          "pitch": 0.2634985591821124,
          "rotation": 0.7853981633974483,
          "target": "144-jst-150"
        },
        {
          "yaw": 1.4588988448418245,
          "pitch": 0.3243061272836272,
          "rotation": 0,
          "target": "142-jst-148"
        },
        {
          "yaw": -1.6128653578972756,
          "pitch": 0.21108358002970107,
          "rotation": 0,
          "target": "139-jst-145"
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
        "yaw": 1.0031674974458156,
        "pitch": -0.03287266982560233,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.0060900200664467,
          "pitch": 0.21246559168095303,
          "rotation": 6.283185307179586,
          "target": "142-jst-148"
        },
        {
          "yaw": 2.574336473406958,
          "pitch": 0.2308691494618298,
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
        "yaw": 1.1400300968708716,
        "pitch": 0.01752451876728145,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.8640747905190675,
          "pitch": 0.40547632582599213,
          "rotation": 0,
          "target": "141-jst-147"
        },
        {
          "yaw": 1.2299629756821187,
          "pitch": 0.21758681530058865,
          "rotation": 0,
          "target": "143-jst-149"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.660380810376374,
          "pitch": 0.06937955959831399,
          "title": "College of Arts and Sciences",
          "text": "It handles the receiving, storage, issuance, and inventory of supplies, maintains records of university property, and coordinates with the procurement and accounting units to ensure that offices and colleges receive the resources they need for their operations."
        }
      ]
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
        "yaw": 1.2046619203042361,
        "pitch": 0.10956983680980059,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.96578661138083,
          "pitch": 0.18555641269300693,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 2.494522186449071,
          "pitch": 0.24956941414205325,
          "rotation": 4.71238898038469,
          "target": "140-jst-146"
        },
        {
          "yaw": -0.5933392274157683,
          "pitch": 0.28956623842148943,
          "rotation": 0,
          "target": "146-jst-151"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "145-jst-152",
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
        "yaw": -0.33313469375062965,
        "pitch": -0.05851800318068001,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.6813237602329725,
          "pitch": 0.26947372655407165,
          "rotation": 0,
          "target": "146-jst-151"
        },
        {
          "yaw": -0.4163936229631311,
          "pitch": 0.19759038633016957,
          "rotation": 0,
          "target": "148-jst-153"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "146-jst-151",
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
        "yaw": 1.7799374004484187,
        "pitch": 0.07892169252901482,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.711738486940229,
          "pitch": 0.23616268720261857,
          "rotation": 0,
          "target": "149-jst-155"
        },
        {
          "yaw": 0.07509878089627797,
          "pitch": 0.2285296860187529,
          "rotation": 0,
          "target": "145-jst-152"
        },
        {
          "yaw": -1.4258987135828072,
          "pitch": 0.2197125169282348,
          "rotation": 0,
          "target": "144-jst-150"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "147-jst-154",
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
        "yaw": 0.8935294941417453,
        "pitch": 0.028551048765748988,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.41810085422445,
          "pitch": 0.2208333463162795,
          "rotation": 0,
          "target": "148-jst-153"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.366901074730591,
          "pitch": 0.07135544562021323,
          "title": "College of Business Administration and Accountancy",
          "text": "It trains students in accounting, management, marketing, entrepreneurship, and finance, prepares them for professional licensure such as the CPA board examination, and engages in research and extension activities that support local businesses and communities"
        }
      ]
    },
    {
      "id": "148-jst-153",
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
        "yaw": -0.7398943640212465,
        "pitch": 0.05923460943788861,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.716088952717703,
          "pitch": 0.2025265068191704,
          "rotation": 0,
          "target": "147-jst-154"
        },
        {
          "yaw": 2.453396150473491,
          "pitch": 0.19908080738111522,
          "rotation": 0,
          "target": "145-jst-152"
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
        "yaw": 0.27426250776805183,
        "pitch": -0.022895836489649213,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.8704674883247936,
          "pitch": 0.3234140585084422,
          "rotation": 0,
          "target": "146-jst-151"
        },
        {
          "yaw": 0.306506270395575,
          "pitch": 0.18318091488844246,
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
        "yaw": -1.816087715318755,
        "pitch": 0.006955343216811016,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.4502301005305025,
          "pitch": 0.1129704449402702,
          "rotation": 0,
          "target": "149-jst-155"
        },
        {
          "yaw": 3.115999718077145,
          "pitch": 0.22712555450407734,
          "rotation": 0,
          "target": "151-jst-157"
        },
        {
          "yaw": -1.705283636289007,
          "pitch": 0.1494973617072901,
          "rotation": 0,
          "target": "153-jst-159"
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
        "yaw": 2.0025958930245524,
        "pitch": -0.02504073751026681,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.7732809809080887,
          "pitch": 0.12446291072873983,
          "rotation": 0,
          "target": "152-jst-158"
        },
        {
          "yaw": -1.211898048498318,
          "pitch": 0.20958833162209345,
          "rotation": 0,
          "target": "150-jst-156"
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
        "yaw": 1.7337346627727372,
        "pitch": -0.10895846625970051,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.646604073861436,
          "pitch": 0.1491124597159441,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.36328000135787,
          "pitch": 0.17109693401113368,
          "rotation": 0,
          "target": "150-jst-156"
        },
        {
          "yaw": 0.7582805960883103,
          "pitch": 0.16459225938885247,
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
        "yaw": -1.5653643762441707,
        "pitch": -0.025228186219989013,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.6248520394623265,
          "pitch": 0.15005990628723254,
          "rotation": 0,
          "target": "153-jst-159"
        },
        {
          "yaw": -1.590838263908628,
          "pitch": 0.15446188325641508,
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
        "yaw": 2.1107603580292027,
        "pitch": 0.0040686732688826055,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.5904409119374456,
          "pitch": 0.1262649786310721,
          "rotation": 0,
          "target": "154-jst-160"
        },
        {
          "yaw": 2.3187555700431535,
          "pitch": 0.1266485028523956,
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
        "yaw": 2.617867889577105,
        "pitch": -0.03512192811767534,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.3167063143450868,
          "pitch": 0.31259838628963976,
          "rotation": 0,
          "target": "155-jst-161"
        },
        {
          "yaw": 3.008434256551535,
          "pitch": 0.12421025840606603,
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
        "yaw": -2.2342622682212934,
        "pitch": -0.016016004747665846,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.1207713669198025,
          "pitch": 0.1390511678744346,
          "rotation": 0,
          "target": "159-jst-164"
        },
        {
          "yaw": 1.4670774416301775,
          "pitch": 0.15479700263377438,
          "rotation": 0,
          "target": "156-jst-162"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "158-jst-165",
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
        "yaw": -0.006434767458975088,
        "pitch": -0.02084581607948266,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.7883428013946254,
          "pitch": 0.14954677040527642,
          "rotation": 0,
          "target": "159-jst-164"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.034113509770071,
          "pitch": 0.034267972062693275,
          "title": "College of Criminal Justice Education",
          "text": "The College of Criminal Justice Education (CCJE) of Laguna State Polytechnic University offers programs in criminology and criminal justice. It trains students in law enforcement, criminal investigation, forensic science, correctional administration, and crime detection, prepares them for the criminologist licensure examination and careers in the police, military, and other public safety agencies, and engages in community-based crime prevention and extension activities."
        }
      ]
    },
    {
      "id": "159-jst-164",
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 2.825289943705828,
          "pitch": 0.17137785045853704,
          "rotation": 0,
          "target": "157-jst-163"
        },
        {
          "yaw": -0.8007628929255066,
          "pitch": 0.14201331668935246,
          "rotation": 0,
          "target": "158-jst-165"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.1641118203804375,
          "pitch": 0.07448471004989266,
          "title": "College of Industrial Technology",
          "text": "The College of Industrial Technology of Laguna State Polytechnic University offers programs in technical and industrial fields such as automotive, electrical, electronics, drafting, food technology, and related trades. It combines classroom instruction with hands-on laboratory and shop training to prepare students for industry work and national certification, and supports extension activities that share technical skills with the community."
        }
      ]
    },
    {
      "id": "160-jst-168",
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
          "yaw": 1.1960390975518198,
          "pitch": 0.11697559565049431,
          "rotation": 0,
          "target": "161-jst-166"
        },
        {
          "yaw": -0.5128080485608777,
          "pitch": 0.17922062911734749,
          "rotation": 0,
          "target": "162-jst-169"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "161-jst-166",
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.18193966999611,
          "pitch": 0.1449356507145101,
          "rotation": 0,
          "target": "160-jst-168"
        },
        {
          "yaw": 1.0790136929573428,
          "pitch": 0.1297224790513738,
          "rotation": 0,
          "target": "134-jst-139"
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
        "yaw": 0.23983999595718508,
        "pitch": -0.024920763451131478,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.992633595188721,
          "pitch": 0.1769347211876635,
          "rotation": 0,
          "target": "160-jst-168"
        },
        {
          "yaw": 1.8089229853825515,
          "pitch": 0.11367814313062752,
          "rotation": 0,
          "target": "129-jst-134"
        },
        {
          "yaw": 0.257446921526542,
          "pitch": 0.13567421883177389,
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
        "yaw": -2.973123329149672,
        "pitch": -0.02003514363103065,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.22256139437818412,
          "pitch": 0.15087871771705608,
          "rotation": 0,
          "target": "162-jst-169"
        },
        {
          "yaw": 1.696877340824276,
          "pitch": 0.18652116788935302,
          "rotation": 0,
          "target": "164-jst-171"
        },
        {
          "yaw": -2.9613765776417402,
          "pitch": 0.13769979140784017,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -3.0341170220226292,
          "pitch": 0.24908887535728041,
          "rotation": 0,
          "target": "163-jst-170"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -1.5765639752396048,
          "pitch": 0.15025913685282433,
          "title": "Medical Clinic",
          "text": "The Medical Clinic of Laguna State Polytechnic University provides basic health services to students, faculty, and staff. It conducts annual medical and dental examinations, gives first aid and treatment for common illnesses and minor injuries, issues medical certificates and clearances, and refers cases needing further care to hospitals or specialists."
        }
      ]
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
        "yaw": -1.9502747047623465,
        "pitch": -0.09238265135587653,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.2848899031486134,
          "pitch": 0.1371931288154169,
          "rotation": 0,
          "target": "162-jst-169"
        },
        {
          "yaw": -1.8972575483110745,
          "pitch": 0.12757457785946258,
          "rotation": 0,
          "target": "166-jst-173"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.4022511657937642,
          "pitch": -0.012703423247828027,
          "title": "Human Kinetics Center&nbsp;",
          "text": "It hosts PE classes, varsity training, intramurals, and other athletic programs, and supports the physical development and wellness of students, faculty, and staff through its sports and recreation facilities."
        }
      ]
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
        "yaw": -2.998733043494809,
        "pitch": -0.10798536741912379,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.12889088221609057,
          "pitch": 0.15075143265239177,
          "rotation": 0,
          "target": "165-jst-172"
        },
        {
          "yaw": -3.0695111417405982,
          "pitch": 0.11584185367145139,
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
        "yaw": 2.8082251541122343,
        "pitch": -0.03571383130343975,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -0.3630272362020932,
          "pitch": 0.13524874476870963,
          "rotation": 0,
          "target": "166-jst-173"
        },
        {
          "yaw": 2.7642858051878907,
          "pitch": 0.11904225280593295,
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
        "yaw": -2.3316291116703205,
        "pitch": -0.015621101260551384,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.7722403147304533,
          "pitch": 0.11793944320940497,
          "rotation": 0,
          "target": "167-jst-174"
        },
        {
          "yaw": -2.2992909976305658,
          "pitch": 0.12188621005230615,
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
        "yaw": -1.377720893924316,
        "pitch": -0.050885220157113054,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.7864612743474417,
          "pitch": 0.13448437145794045,
          "rotation": 0,
          "target": "168-jst-175"
        },
        {
          "yaw": -1.3982673168627642,
          "pitch": 0.13861866130348588,
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
        "yaw": -1.317669491694346,
        "pitch": -0.17300225832341987,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.7783856517350198,
          "pitch": 0.1442085336982295,
          "rotation": 0,
          "target": "169-jst-176"
        },
        {
          "yaw": -1.4000964744646716,
          "pitch": 0.1305567921884574,
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
        "yaw": 0.49915848119961126,
        "pitch": -0.04457717388071103,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.700819420796746,
          "pitch": 0.1141149498701477,
          "rotation": 0,
          "target": "170-jst-177"
        },
        {
          "yaw": 0.4883549343770426,
          "pitch": 0.1613807180969289,
          "rotation": 0,
          "target": "172-jst-179"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.6364146819201588,
          "pitch": -0.002793497380196186,
          "title": "College of Engineering",
          "text": "The College of Engineering of Laguna State Polytechnic University offers degree programs in various engineering fields such as civil, mechanical, electrical, and computer engineering. It combines classroom instruction with laboratory and design work to prepare students for the engineering licensure examinations and professional practice, and supports research and extension projects that apply engineering solutions to community and industry problems."
        }
      ]
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
        "yaw": -0.4597733031458162,
        "pitch": -0.07134335553036308,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.5973081425849482,
          "pitch": 0.1346428277593681,
          "rotation": 0,
          "target": "171-jst-178"
        },
        {
          "yaw": -0.5916908814155981,
          "pitch": 0.17347204580011244,
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
        "yaw": -0.22622060044743897,
        "pitch": -0.06604290821098147,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.8420628783627,
          "pitch": 0.12373030372669191,
          "rotation": 0,
          "target": "172-jst-179"
        },
        {
          "yaw": -0.23514168494173404,
          "pitch": 0.1108472951713324,
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
        "yaw": -2.323848188355475,
        "pitch": -0.02514224690024669,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.8449338384970844,
          "pitch": 0.23189938835777113,
          "rotation": 0,
          "target": "173-jst-180"
        },
        {
          "yaw": -0.7531101431140748,
          "pitch": 0.256695700896147,
          "rotation": 0,
          "target": "175-jst-182"
        },
        {
          "yaw": -2.4421032634604494,
          "pitch": 0.15375683039069266,
          "rotation": 10.995574287564278,
          "target": "190-jst-198"
        },
        {
          "yaw": -2.88,
          "pitch": 0.237,
          "rotation": 0,
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
        "yaw": 0.4220847272680217,
        "pitch": -0.025442610078556527,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.614872532015344,
          "pitch": 0.2062309958162345,
          "rotation": 0,
          "target": "174-jst-181"
        },
        {
          "yaw": 0.41229509301380496,
          "pitch": 0.2050574104782168,
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
        "yaw": 0.3509451544518072,
        "pitch": 0.020185731415423902,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.726639044442484,
          "pitch": 0.16612553542135444,
          "rotation": 0,
          "target": "175-jst-182"
        },
        {
          "yaw": 0.3936626227499147,
          "pitch": 0.187760387525568,
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
        "yaw": -1.844131644173828,
        "pitch": 0.03882749394863083,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.3467994959491296,
          "pitch": 0.21282073064831408,
          "rotation": 0,
          "target": "176-jst-183"
        },
        {
          "yaw": -1.8352455646168018,
          "pitch": 0.16191365256146284,
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
        "yaw": -0.16384723590150507,
        "pitch": -0.01780982705498957,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.965831247839178,
          "pitch": 0.24674493606542747,
          "rotation": 0,
          "target": "177-jst-184"
        },
        {
          "yaw": -0.0675643234114176,
          "pitch": 0.3023821867162795,
          "rotation": 0.7853981633974483,
          "target": "179-jst-187"
        },
        {
          "yaw": 1.4362348853684814,
          "pitch": 0.2558595917116886,
          "rotation": 0,
          "target": "180-jst-188"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "179-jst-187",
      "name": "JST-187",
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
          "yaw": 0.7370632537546893,
          "pitch": 0.3618371963929654,
          "rotation": 5.497787143782138,
          "target": "178-jst-185"
        },
        {
          "yaw": -3.0490806663941044,
          "pitch": 0.25751719237313253,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 0.36645597956980147,
          "pitch": 0.27696694591897675,
          "rotation": 0,
          "target": "178-jst-185"
        },
        {
          "yaw": -2.8219318918074148,
          "pitch": 0.24249800184617243,
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
        "yaw": -2.4226468126578204,
        "pitch": 0.06261795156713035,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.7242082627606052,
          "pitch": 0.28998790632826754,
          "rotation": 0,
          "target": "180-jst-188"
        },
        {
          "yaw": -2.434580853829651,
          "pitch": 0.23181645468645584,
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
        "yaw": -1.6521176518609195,
        "pitch": -0.02035408806284522,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.4867429869458428,
          "pitch": 0.2370762204710246,
          "rotation": 0,
          "target": "181-jst-189"
        },
        {
          "yaw": -1.6254524801455403,
          "pitch": 0.2258000986427131,
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
        "yaw": -2.46199504982453,
        "pitch": -0.008199415747071725,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.6664989129581542,
          "pitch": 0.2152929243003303,
          "rotation": 0,
          "target": "182-jst-190"
        },
        {
          "yaw": -2.4443533457900006,
          "pitch": 0.21481056362306106,
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
        "yaw": -2.634565657827409,
        "pitch": -0.0007728112981482127,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.43520489298476583,
          "pitch": 0.19000551949554634,
          "rotation": 0,
          "target": "183-jst-191"
        },
        {
          "yaw": -2.575730506557317,
          "pitch": 0.20223268958580398,
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
        "yaw": -2.964879951115062,
        "pitch": -0.01890691609607309,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.19912123165162576,
          "pitch": 0.212395430096608,
          "rotation": 0,
          "target": "184-jst-192"
        },
        {
          "yaw": -3.0555177819261523,
          "pitch": 0.2337998274335984,
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
        "yaw": -2.9073624751493767,
        "pitch": 0.03684787480860763,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.1936474133234114,
          "pitch": 0.11603769249561324,
          "rotation": 0,
          "target": "185-jst-193"
        },
        {
          "yaw": 2.2816824870064263,
          "pitch": 0.2535154271706048,
          "rotation": 0.7853981633974483,
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
        "yaw": -0.41295473146114503,
        "pitch": -0.0407081761257011,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.646442495023102,
          "pitch": 0.1963409179322042,
          "rotation": 0,
          "target": "188-jst-196"
        },
        {
          "yaw": -0.4588588246637233,
          "pitch": 0.11051229151345687,
          "rotation": 0,
          "target": "94-jst-98"
        }
      ],
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
        "yaw": 1.096958862923671,
        "pitch": 0.009521165028990808,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.761490779872701,
          "pitch": 0.3517033480708971,
          "rotation": 1.5707963267948966,
          "target": "186-jst-194"
        },
        {
          "yaw": 1.0497978215062584,
          "pitch": 0.2528042308634859,
          "rotation": 0,
          "target": "187-jst-195"
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
        "yaw": -0.4683893808923596,
        "pitch": -0.043252437133546096,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.583188702947023,
          "pitch": 0.26352422733414826,
          "rotation": 0,
          "target": "190-jst-198"
        },
        {
          "yaw": -1.4221121019912246,
          "pitch": 0.23699486879451825,
          "rotation": 0,
          "target": "174-jst-181"
        },
        {
          "yaw": -0.5668228763962535,
          "pitch": 0.3591942245631863,
          "rotation": 0,
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
        "yaw": -1.5974077008622132,
        "pitch": 0.050465506549100425,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.6604253383552674,
          "pitch": 0.20286970118649883,
          "rotation": 0,
          "target": "189-jst-197"
        },
        {
          "yaw": -2.36,
          "pitch": 0.1538,
          "rotation": 0,
          "target": "174-jst-181"
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
        "yaw": -1.5103502890225258,
        "pitch": 0.07794232956154445,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.5182083374748139,
          "pitch": 0.37878818874726683,
          "rotation": 0,
          "target": "192-jst-200"
        },
        {
          "yaw": 1.59,
          "pitch": 0.3,
          "rotation": 0,
          "target": "189-jst-197"
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
        "yaw": -1.3930007297472145,
        "pitch": 0.025846918274050168,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.7347934681888724,
          "pitch": 0.08330011348499156,
          "rotation": 0,
          "target": "191-jst-199"
        },
        {
          "yaw": -1.4286224786707056,
          "pitch": 0.22916534318306248,
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
        "yaw": -1.3161517468828947,
        "pitch": 0.05614420501784423,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 1.8437449714831908,
          "pitch": 0.17019090272679094,
          "rotation": 0,
          "target": "192-jst-200"
        },
        {
          "yaw": -1.3119281350165792,
          "pitch": 0.2066440465195214,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 2.3594137423088917,
          "pitch": 0.21577891977213604,
          "rotation": 0,
          "target": "193-jst-201"
        },
        {
          "yaw": -0.7686896176584384,
          "pitch": 0.1976995492420972,
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
        "yaw": -0.23103998596158704,
        "pitch": -0.00027522481521202735,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 2.8933547863872233,
          "pitch": 0.18975007711770786,
          "rotation": 0,
          "target": "194-jst-202"
        },
        {
          "yaw": 0.952178274164245,
          "pitch": 0.3907173851648018,
          "rotation": 12.566370614359176,
          "target": "196-jst-204"
        },
        {
          "yaw": -0.25534241298339744,
          "pitch": 0.24318499068760602,
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
        "yaw": 0.3709760891638183,
        "pitch": -0.13272187427854298,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.6582434041395224,
          "pitch": 0.4481610578390196,
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
        "yaw": 0.26102227573595016,
        "pitch": -0.006310400995024779,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": 0.3021881690291721,
          "pitch": 0.19122016497466277,
          "rotation": 0,
          "target": "198-jst-206"
        },
        {
          "yaw": -2.84,
          "pitch": 0.2432,
          "rotation": 0,
          "target": "195-jst-203"
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
        "yaw": 0.55938854886322,
        "pitch": -0.03803958994026857,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.511786975921739,
          "pitch": 0.17275514582273388,
          "rotation": 0,
          "target": "197-jst-205"
        },
        {
          "yaw": 0.6032248886163796,
          "pitch": 0.17079090378782524,
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
        "yaw": 0.7833926597808691,
        "pitch": -0.00749607820725906,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.319778429035061,
          "pitch": 0.1592206501041069,
          "rotation": 0,
          "target": "198-jst-206"
        },
        {
          "yaw": 0.7981022893565104,
          "pitch": 0.17312605090982203,
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
        "yaw": 2.0896396554397194,
        "pitch": -0.000029838067986176497,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.145435485328063,
          "pitch": 0.1616190909203894,
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
        "yaw": 0.9495160284156601,
        "pitch": 0.030606014960227412,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.9338836817490268,
          "pitch": 0.20026767885216046,
          "rotation": 0,
          "target": "179-jst-187"
        },
        {
          "yaw": 0.753365843867698,
          "pitch": 0.22962356736953993,
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
        "yaw": 0.9007343560518954,
        "pitch": -0.018596672848202545,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -2.3250782731185975,
          "pitch": 0.2448657786952957,
          "rotation": 0,
          "target": "201-jst-209"
        },
        {
          "yaw": 0.849729033966895,
          "pitch": 0.26446898188214085,
          "rotation": 0,
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
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.848822903679114,
          "pitch": 0.17009742331660682,
          "rotation": 0,
          "target": "202-jst-210"
        },
        {
          "yaw": 2.4675171158658653,
          "pitch": 0.17049669334850748,
          "rotation": 0,
          "target": "204-jst-212"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.8020253079593012,
          "pitch": -0.0050362706507876,
          "title": "The Gears Student Publication",
          "text": "The Gears Publication is the official student publication of Laguna State Polytechnic University - Sta. Cruz Campus. It serves as the voice of the student body, producing news, editorials, features, literary works, and photojournalism that cover campus events and issues. Its editorial board of student writers, editors, and artists works under a faculty adviser, and the publication also handles campus coverage assignments and maintains archives of its past issues."
        }
      ]
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
        "yaw": 2.733233048911436,
        "pitch": 0.02445819081059497,
        "fov": 1.2599180821480807
      },
      "linkHotspots": [
        {
          "yaw": -1.9232790116129053,
          "pitch": 0.30064607071034466,
          "rotation": 0,
          "target": "203-jst-211"
        },
        {
          "yaw": 2.7863521270076577,
          "pitch": 0.12410432624056433,
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
    "autorotateEnabled": false,
    "fullscreenButton": false,
    "viewControlButtons": false
  }
};

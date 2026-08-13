/* Each linkHotspot may carry an optional "targetYaw": <radians> to set the
   heading the destination scene opens at during a warp (see kiosk-tour.js
   warpToScene). When absent, the destination opens facing the clicked arrow's
   own "yaw" — so no hotspot needs targetYaw unless you want to fine-tune a
   specific arrival. */
window.APP_DATA = {
  "scenes": [
    {
      "id": "0-1",
      "name": "1",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 0.47797377385221473,
          "pitch": 0.7737353002755487,
          "rotation": 0,
          "target": "2-4"
        },
        {
          "yaw": -0.8183007333190382,
          "pitch": 0.676928694250142,
          "rotation": 0,
          "target": "1-3"
        },
        {
          "yaw": 2.167460708614602,
          "pitch": 0.9045760822317881,
          "rotation": 0,
          "target": "44-46"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.9409279669764636,
          "pitch": 0.1755930797179932,
          "title": "Student Services Building",
          "text": "Handles student welfare, scholarships, academic records, and support services for the LSPU student body."
        }
      ]
    },
    {
      "id": "1-3",
      "name": "3",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.7622563626476815,
          "pitch": 0.953462750036536,
          "rotation": 0,
          "target": "0-1"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "2-4",
      "name": "4",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.7649095693232368,
          "pitch": 0.8310577774075902,
          "rotation": 0,
          "target": "0-1"
        },
        {
          "yaw": 2.333854626283472,
          "pitch": 0.9800517772708872,
          "rotation": 0,
          "target": "3-5-3"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.9206036009241085,
          "pitch": 0.1350415142664403,
          "title": "Auditor's Office",
          "text": "Responsible for internal auditing of university financial transactions and ensuring compliance with government regulations."
        }
      ]
    },
    {
      "id": "3-5-3",
      "name": "5-3",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.053340998806486795,
          "pitch": 0.9253697277973547,
          "rotation": 0,
          "target": "36-38"
        },
        {
          "yaw": 2.703432965265569,
          "pitch": 1.0066911643279397,
          "rotation": 0,
          "target": "4-6"
        },
        {
          "yaw": 0.44331662611291733,
          "pitch": 0.62330006489222,
          "rotation": 1.5707963267948966,
          "target": "2-4"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "4-6",
      "name": "6",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.4744011775024397,
          "pitch": 0.9929393996852323,
          "rotation": 7.0685834705770345,
          "target": "3-5-3"
        },
        {
          "yaw": -0.45756644447255823,
          "pitch": 0.8683667603940499,
          "rotation": 0,
          "target": "5-7"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.822095214805719,
          "pitch": 0.179653759904582,
          "title": "Cashier's Office (Registrar)",
          "text": "Processes tuition payments, fees, and other financial transactions for students and university personnel."
        },
        {
          "yaw": -1.8148160558258901,
          "pitch": 0.20063524013133716,
          "title": "College of Computer Studies",
          "text": "Offers programs in Information Technology and Computer Science, developing future tech professionals for the digital economy."
        }
      ]
    },
    {
      "id": "5-7",
      "name": "7",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.437949362277621,
          "pitch": 0.8919440945122918,
          "rotation": 0,
          "target": "4-6"
        },
        {
          "yaw": 2.009297723926651,
          "pitch": 0.7534044874008359,
          "rotation": 0,
          "target": "35-37"
        },
        {
          "yaw": 0.24524867662026395,
          "pitch": 1.0233445760581397,
          "rotation": 0,
          "target": "6-8"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "6-8",
      "name": "8",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.2421016077123443,
          "pitch": 0.9225115877831591,
          "rotation": 0,
          "target": "5-7"
        },
        {
          "yaw": 0.6458486882947412,
          "pitch": 0.78141325698199,
          "rotation": 0,
          "target": "7-9"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.8744480704687447,
          "pitch": 0.19344683522834316,
          "title": "Title",
          "text": "Campus facility — description to be updated."
        }
      ]
    },
    {
      "id": "7-9",
      "name": "9",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.080557249932724,
          "pitch": 0.8337378583817383,
          "rotation": 0,
          "target": "6-8"
        },
        {
          "yaw": -1.131788750661995,
          "pitch": 0.7895210793515446,
          "rotation": 0,
          "target": "8-10"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.09047745163147525,
          "pitch": 0.26801382211129265,
          "title": "<div>Quality Assurance Center</div>",
          "text": "Oversees academic quality standards, program accreditation, and continuous improvement initiatives across the university."
        }
      ]
    },
    {
      "id": "8-10",
      "name": "10",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.0363708497135953,
          "pitch": 0.94675603798661,
          "rotation": 25.132741228718363,
          "target": "7-9"
        },
        {
          "yaw": -1.0211377021366772,
          "pitch": 0.885934600269584,
          "rotation": 0,
          "target": "9-11"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "9-11",
      "name": "11",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.2042833702881577,
          "pitch": 0.9432628497531343,
          "rotation": 0,
          "target": "8-10"
        },
        {
          "yaw": -1.2291421335753512,
          "pitch": 0.9050025190378275,
          "rotation": 0,
          "target": "10-12"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.0897829500551044,
          "pitch": 0.27618353194961287,
          "title": "ICTSO",
          "text": "The Information and Communications Technology Services Office manages the university's IT infrastructure, network, and digital services."
        }
      ]
    },
    {
      "id": "10-12",
      "name": "12",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.2708527155244838,
          "pitch": 0.9310447538654927,
          "rotation": 0,
          "target": "11-13"
        },
        {
          "yaw": -1.3211206227529075,
          "pitch": 0.874516756011225,
          "rotation": 5.497787143782138,
          "target": "9-11"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.383624473435102,
          "pitch": 0.20068630598593273,
          "title": "CCS Faculty",
          "text": "Faculty offices and workrooms for College of Computer Studies instructors and professors."
        },
        {
          "yaw": -0.4736942982893364,
          "pitch": 0.19240033512513754,
          "title": "CCS Dean's Office",
          "text": "Administrative hub of the College of Computer Studies, led by the Dean overseeing academic and administrative affairs."
        }
      ]
    },
    {
      "id": "11-13",
      "name": "13",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.9245917240482306,
          "pitch": 0.890270337211474,
          "rotation": 0,
          "target": "10-12"
        },
        {
          "yaw": 0.8766063057767308,
          "pitch": 0.9316620210878863,
          "rotation": 0,
          "target": "12-14"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "12-14",
      "name": "14",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.1960085201192108,
          "pitch": 0.9937669037310695,
          "rotation": 0,
          "target": "11-13"
        },
        {
          "yaw": -0.44872906556493497,
          "pitch": 1.007467553078019,
          "rotation": 0,
          "target": "13-15"
        },
        {
          "yaw": -2.1652177213231916,
          "pitch": 0.9067285864680201,
          "rotation": 0,
          "target": "14-16"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "13-15",
      "name": "15",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.5263899219199892,
          "pitch": 0.8061348971103488,
          "rotation": 0,
          "target": "12-14"
        },
        {
          "yaw": 3.088056306887194,
          "pitch": 0.9588280218433969,
          "rotation": 0,
          "target": "18-20"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "14-16",
      "name": "16",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.6001649130856848,
          "pitch": 0.9732136554264805,
          "rotation": 0,
          "target": "12-14"
        },
        {
          "yaw": 2.6156692532114123,
          "pitch": 0.9899693623875763,
          "rotation": 0,
          "target": "13-15"
        },
        {
          "yaw": 1.0855896259668292,
          "pitch": 0.7291149799608547,
          "rotation": 0,
          "target": "15-17"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "15-17",
      "name": "17",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 2.449340771941629,
          "pitch": 1.026418136553854,
          "rotation": 0,
          "target": "14-16"
        },
        {
          "yaw": -1.8567429468305363,
          "pitch": 0.9206785584725221,
          "rotation": 4.71238898038469,
          "target": "16-18"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "16-18",
      "name": "18",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.4918455540255877,
          "pitch": 0.9330317860625925,
          "rotation": 0,
          "target": "15-17"
        },
        {
          "yaw": -2.770005973241174,
          "pitch": 1.0067245011720178,
          "rotation": 0,
          "target": "17-19"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.03659313245333351,
          "pitch": 0.20880954535039464,
          "title": "Office of the Campus Director",
          "text": "Central executive office of the campus, headed by the Campus Director responsible for all academic and administrative operations."
        }
      ]
    },
    {
      "id": "17-19",
      "name": "19",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 0.4361169843799928,
          "pitch": 0.9175295964717467,
          "rotation": 0,
          "target": "16-18"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.6457628942961549,
          "pitch": 0.22613996472629871,
          "title": "Records Management Office",
          "text": "Maintains and safeguards official university records, documents, and archives for students and personnel."
        },
        {
          "yaw": -1.4684720940799139,
          "pitch": 0.21190738693597666,
          "title": "Title",
          "text": "Campus facility — description to be updated."
        }
      ]
    },
    {
      "id": "18-20",
      "name": "20",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 2.5709057359340353,
          "pitch": 1.0643082237492827,
          "rotation": 0,
          "target": "13-15"
        },
        {
          "yaw": -1.9035591557116973,
          "pitch": 1.013268329114819,
          "rotation": 0,
          "target": "19-21"
        },
        {
          "yaw": 0.030294746323949795,
          "pitch": 0.9448575971782631,
          "rotation": 0,
          "target": "33-35"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.7652359866530585,
          "pitch": 0.025221819615548924,
          "title": "Business Affairs Office",
          "text": "Manages the university's financial operations, procurement, and business transactions."
        }
      ]
    },
    {
      "id": "19-21",
      "name": "21",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.6087495332541639,
          "pitch": 0.9323249872421044,
          "rotation": 0,
          "target": "18-20"
        },
        {
          "yaw": 2.0400403358670696,
          "pitch": 1.0737793398079525,
          "rotation": 0,
          "target": "20-22"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "20-22",
      "name": "22",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 0.8013425924257191,
          "pitch": 1.094705518394644,
          "rotation": 0,
          "target": "19-21"
        },
        {
          "yaw": 3.1167502049036546,
          "pitch": 1.0533579271320797,
          "rotation": 0,
          "target": "21-23"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.9515694922837419,
          "pitch": 0.03607498072690163,
          "title": "LSPU Hotel",
          "text": "A training hotel facility operated by the College of Hospitality Management and Tourism for hands-on student learning experiences."
        }
      ]
    },
    {
      "id": "21-23",
      "name": "23",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.9432795046324127,
          "pitch": 1.052557011402138,
          "rotation": 0,
          "target": "20-22"
        },
        {
          "yaw": 0.38010049332033446,
          "pitch": 1.0106899597222956,
          "rotation": 0,
          "target": "22-24"
        },
        {
          "yaw": 1.7920895126207643,
          "pitch": 1.0153685855972512,
          "rotation": 0,
          "target": "24-26"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "22-24",
      "name": "24",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 0.4903934944423103,
          "pitch": 0.9317484034180286,
          "rotation": 0,
          "target": "21-23"
        },
        {
          "yaw": -2.7932983976996493,
          "pitch": 1.1808423212804282,
          "rotation": 0,
          "target": "23-25"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.0205469164856176,
          "pitch": 0.2787309929253716,
          "title": "Collage of Hospitality and Management and Tourism",
          "text": "Offers programs in hotel management, tourism, and culinary arts, preparing students for careers in the global hospitality industry."
        }
      ]
    },
    {
      "id": "23-25",
      "name": "25",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.3705223543875427,
          "pitch": 0.8767215578771257,
          "rotation": 0,
          "target": "22-24"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.10213649833668192,
          "pitch": 0.08618402452231777,
          "title": "Supply Office",
          "text": "Manages procurement, storage, and distribution of university supplies and equipment for all departments."
        }
      ]
    },
    {
      "id": "24-26",
      "name": "26",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 3.05460170534438,
          "pitch": 0.9487270302008781,
          "rotation": 5.497787143782138,
          "target": "21-23"
        },
        {
          "yaw": 0.01641894095831553,
          "pitch": 0.9540178689924748,
          "rotation": 0,
          "target": "27-29"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "25-27",
      "name": "27",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.1223537357095186,
          "pitch": 1.0441407324303817,
          "rotation": 0,
          "target": "26-28"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "26-28",
      "name": "28",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.0076954821801927,
          "pitch": 1.0517698900499752,
          "rotation": 0,
          "target": "25-27"
        },
        {
          "yaw": 2.1110465643287455,
          "pitch": 1.0709856880016986,
          "rotation": 0,
          "target": "27-29"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "27-29",
      "name": "29",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.63959060370674,
          "pitch": 1.1251974801749114,
          "rotation": 0,
          "target": "24-26"
        },
        {
          "yaw": 1.7410889529342333,
          "pitch": 0.938984436500558,
          "rotation": 0,
          "target": "26-28"
        },
        {
          "yaw": 0.2386396308223162,
          "pitch": 1.051120820981735,
          "rotation": 0,
          "target": "28-30"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "28-30",
      "name": "30",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.7244693859073674,
          "pitch": 1.1418091030749302,
          "rotation": 0,
          "target": "27-29"
        },
        {
          "yaw": -0.7325497730794943,
          "pitch": 1.0185198547978942,
          "rotation": 0,
          "target": "29-31"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 2.890021155957994,
          "pitch": 0.02062272839166468,
          "title": "University Clinic",
          "text": "Provides basic health care, first aid, and medical consultations for students, faculty, and university staff."
        },
        {
          "yaw": -2.5997783666675733,
          "pitch": 0.031296128393137224,
          "title": "College of Nursing and Allied Health",
          "text": "Trains future nurses and allied health professionals through rigorous academic coursework and clinical practicum programs."
        },
        {
          "yaw": 0.5503001023883023,
          "pitch": 0.009323950527594604,
          "title": "Human Kinetics Center",
          "text": "A sports and physical education facility supporting student athletic programs, health, and wellness activities."
        }
      ]
    },
    {
      "id": "29-31",
      "name": "31",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 2.4668943470857805,
          "pitch": 1.196647619081972,
          "rotation": 0,
          "target": "28-30"
        },
        {
          "yaw": -0.5169214859223494,
          "pitch": 1.0758692404604382,
          "rotation": 0,
          "target": "30-32"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 0.5601519544443612,
          "pitch": 0.007147579410109017,
          "title": "College of Engineering&nbsp;",
          "text": "Offers engineering degree programs with modern laboratory facilities, preparing graduates for national and international engineering practice."
        }
      ]
    },
    {
      "id": "30-32",
      "name": "32",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 2.8917992007550497,
          "pitch": 1.079385700416669,
          "rotation": 0,
          "target": "29-31"
        },
        {
          "yaw": 1.3676238119335018,
          "pitch": 0.9430397841733651,
          "rotation": 0,
          "target": "31-33"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "31-33",
      "name": "33",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 0.5283543068937657,
          "pitch": 1.0938371406620462,
          "rotation": 0,
          "target": "30-32"
        },
        {
          "yaw": -2.4834712678941315,
          "pitch": 0.9091223644119921,
          "rotation": 0,
          "target": "32-34"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "32-34",
      "name": "34",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -1.7427933114593088,
          "pitch": 0.8432944788337782,
          "rotation": 0,
          "target": "31-33"
        },
        {
          "yaw": 2.352832778771801,
          "pitch": 0.6975469105259933,
          "rotation": 0,
          "target": "40-42"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -0.005754628623620306,
          "pitch": 0.10562164345161307,
          "title": "I.G.P Building",
          "text": "Income Generating Project building housing university-managed commercial services and enterprise programs that support institutional funding."
        }
      ]
    },
    {
      "id": "33-35",
      "name": "35",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.1084236140827404,
          "pitch": 1.0686495205487994,
          "rotation": 0,
          "target": "36-38"
        },
        {
          "yaw": 1.067815971125647,
          "pitch": 0.9440178550686902,
          "rotation": 0,
          "target": "18-20"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.506576371378321,
          "pitch": 0.020192776866338136,
          "title": "Activity Center",
          "text": "A multi-purpose venue for student events, university ceremonies, cultural activities, and major academic gatherings."
        }
      ]
    },
    {
      "id": "34-36",
      "name": "36",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 0.20618285709761786,
          "pitch": 0.9978758384217272,
          "rotation": 0,
          "target": "44-46"
        },
        {
          "yaw": 2.9757252665690306,
          "pitch": 1.0373235393086517,
          "rotation": 0,
          "target": "0-1"
        },
        {
          "yaw": -1.4984342095651755,
          "pitch": 1.0518245443870597,
          "rotation": 0,
          "target": "36-38"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "35-37",
      "name": "37",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.6416575556506388,
          "pitch": 0.9544856999784272,
          "rotation": 0,
          "target": "5-7"
        },
        {
          "yaw": 2.32502305995794,
          "pitch": 1.12756541346568,
          "rotation": 0,
          "target": "36-38"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "36-38",
      "name": "38",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -2.498835625326679,
          "pitch": 0.9578165408754735,
          "rotation": 0,
          "target": "35-37"
        },
        {
          "yaw": -1.0002372508064425,
          "pitch": 0.9383362482358635,
          "rotation": 0,
          "target": "33-35"
        },
        {
          "yaw": 2.386672526458474,
          "pitch": 0.7696700443677535,
          "rotation": 0,
          "target": "34-36"
        },
        {
          "yaw": 0.7683656406237329,
          "pitch": 1.0894110574076006,
          "rotation": 0,
          "target": "39-41"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -2.4421946561461496,
          "pitch": -0.00291350746587149,
          "title": "Administration Building",
          "text": "Main administrative center of the university, housing key governance offices and executive leadership."
        }
      ]
    },
    {
      "id": "37-39",
      "name": "39",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [],
      "infoHotspots": []
    },
    {
      "id": "38-40",
      "name": "40",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [],
      "infoHotspots": []
    },
    {
      "id": "39-41",
      "name": "41",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.4047082321524407,
          "pitch": 0.7021440397840273,
          "rotation": 18.06415775814132,
          "target": "40-42"
        },
        {
          "yaw": -0.3121811023000234,
          "pitch": 0.8576577479413814,
          "rotation": 0,
          "target": "41-43"
        },
        {
          "yaw": 2.9707096700381515,
          "pitch": 0.85847614999504,
          "rotation": 0,
          "target": "42-44"
        },
        {
          "yaw": -1.7254124389781236,
          "pitch": 0.9686378509239155,
          "rotation": 0,
          "target": "36-38"
        }
      ],
      "infoHotspots": [
        {
          "yaw": 1.3418815464479295,
          "pitch": -0.028392667547262107,
          "title": "Grand Stand",
          "text": "Outdoor grandstand overlooking the university sports field, used for athletic competitions and major university ceremonies."
        }
      ]
    },
    {
      "id": "40-42",
      "name": "42",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.1406998306169385,
          "pitch": 0.9008617445510083,
          "rotation": 0,
          "target": "32-34"
        },
        {
          "yaw": -0.3279648122716896,
          "pitch": 0.7642884722071717,
          "rotation": 0,
          "target": "41-43"
        },
        {
          "yaw": -1.53580920103804,
          "pitch": 0.7345401050144762,
          "rotation": 0,
          "target": "39-41"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "41-43",
      "name": "43",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 2.632428143632808,
          "pitch": 0.7407970083453037,
          "rotation": 0,
          "target": "40-42"
        },
        {
          "yaw": -1.96759414896583,
          "pitch": 0.943347762426253,
          "rotation": 0,
          "target": "39-41"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "42-44",
      "name": "44",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 0.1376801861816297,
          "pitch": 1.1023906211089063,
          "rotation": 0.7853981633974483,
          "target": "39-41"
        },
        {
          "yaw": -1.7528675497173012,
          "pitch": 0.7850413257490985,
          "rotation": 0,
          "target": "43-45"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "43-45",
      "name": "45",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.4055260912153056,
          "pitch": 0.7449264968287785,
          "rotation": 10.995574287564278,
          "target": "42-44"
        },
        {
          "yaw": 3.054077738122441,
          "pitch": 0.843072447428721,
          "rotation": 0,
          "target": "44-46"
        }
      ],
      "infoHotspots": [
        {
          "yaw": -1.6976723464004273,
          "pitch": 0.028289166572429636,
          "title": "University Library",
          "text": "Houses an extensive collection of books, journals, and digital resources supporting academic research and lifelong learning."
        }
      ]
    },
    {
      "id": "44-46",
      "name": "46",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        }
      ],
      "faceSize": 1000,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": 1.1570616392689406,
          "pitch": 0.798834740295618,
          "rotation": 0,
          "target": "43-45"
        },
        {
          "yaw": -0.26868194183682625,
          "pitch": 0.6339437349714192,
          "rotation": 0,
          "target": "34-36"
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

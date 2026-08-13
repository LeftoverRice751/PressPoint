"""LocationsTableSeeder Seeder."""

from masoniteorm.seeds import Seeder

from app.models.Locations import Locations


class LocationsTableSeeder(Seeder):
    """The 37 campus locations, as real WGS84 coordinates.

    These are not hand-typed. Each one was digitised on campus-map.png in
    QGIS and converted through the georeferencing in
    app/services/CampusGeo.py, which is also what the
    2026_08_12_164500_convert_locations_to_wgs84 migration used. Seeding a
    fresh database therefore lands on the same numbers a migrated one holds.

    Seven decimal places is roughly 11 mm, matching the decimal(10,7)
    columns. Do not round these down: at five places the pins start visibly
    drifting off their buildings on the kiosk.
    """

    def run(self):
        """Run the database seeds."""
        Locations.create(
            {
                "name": "Main Gate",
                "type": "Entrance/Exit",
                "latitude": 14.2617464,
                "longitude": 121.3979071,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Student Services Building",
                "type": "Building/Entrance",
                "latitude": 14.2617812,
                "longitude": 121.3977925,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Computer Studies (CCS)",
                "type": "Department",
                "latitude": 14.2622146,
                "longitude": 121.3972508,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Auditor's Office",
                "type": "Office",
                "latitude": 14.2619888,
                "longitude": 121.3977371,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Supreme Student Building",
                "type": "Building",
                "latitude": 14.2618059,
                "longitude": 121.3981438,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "General Service Office Building (GSO)",
                "type": "Office/Building",
                "latitude": 14.2618597,
                "longitude": 121.3983176,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Multi Purpose Building",
                "type": "Building",
                "latitude": 14.2618752,
                "longitude": 121.3984444,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Administrative Building/Registrar's Office",
                "type": "Building/Office",
                "latitude": 14.2623142,
                "longitude": 121.3976883,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "University library",
                "type": "Library",
                "latitude": 14.2619834,
                "longitude": 121.3980421,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Business Affairs Office (BAO)",
                "type": "Office",
                "latitude": 14.2626097,
                "longitude": 121.3975702,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Teacher Education (CTE)",
                "type": "Department",
                "latitude": 14.2626648,
                "longitude": 121.3971395,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Supply Office",
                "type": "Office",
                "latitude": 14.2628331,
                "longitude": 121.3968599,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "University Hotel",
                "type": "Hotel",
                "latitude": 14.2628833,
                "longitude": 121.3971327,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Hospitality Management and Tourism (CHMT)",
                "type": "Department",
                "latitude": 14.2630319,
                "longitude": 121.3970319,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Arts and Sciences (CAS)",
                "type": "Department",
                "latitude": 14.2627892,
                "longitude": 121.3966715,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Business Administration And Accountancy (CBAA)",
                "type": "Department",
                "latitude": 14.2629929,
                "longitude": 121.3966138,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Student Center/ROTC Building",
                "type": "Building",
                "latitude": 14.2629304,
                "longitude": 121.3960126,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Criminal Justice and Education Academic Building (CCJE)",
                "type": "Academic Building",
                "latitude": 14.2631091,
                "longitude": 121.3962768,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Criminal Justice (CCJE)",
                "type": "Department",
                "latitude": 14.2632524,
                "longitude": 121.3959154,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Industrial Technology (CIT)",
                "type": "Department",
                "latitude": 14.2633416,
                "longitude": 121.3964161,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Industrial Technology Academic Building (CIT)",
                "type": "Academic Building",
                "latitude": 14.2635344,
                "longitude": 121.3961838,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Automotive Building",
                "type": "Building",
                "latitude": 14.2631774,
                "longitude": 121.3968863,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Nursing and Allied Health (CONAH)",
                "type": "Department",
                "latitude": 14.2635343,
                "longitude": 121.3974877,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "University Clinic",
                "type": "Clinic",
                "latitude": 14.2634132,
                "longitude": 121.3973740,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Sports and Kinetics Building",
                "type": "Building",
                "latitude": 14.2633111,
                "longitude": 121.3975726,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "DOST/C-FOSH Building",
                "type": "C FOSH Facility",
                "latitude": 14.2633509,
                "longitude": 121.3977362,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Activity Center (AC)",
                "type": "Activity Center",
                "latitude": 14.2629404,
                "longitude": 121.3979024,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Engineering Testing Center",
                "type": "Testing Center",
                "latitude": 14.2632695,
                "longitude": 121.3980533,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Senior High School Building",
                "type": "Building",
                "latitude": 14.2633559,
                "longitude": 121.3982651,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Engineering New Building (COE)",
                "type": "Department",
                "latitude": 14.2634100,
                "longitude": 121.3980316,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Engineering Old Building (COE)",
                "type": "Department",
                "latitude": 14.2636751,
                "longitude": 121.3979960,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "CFOSH Bakery",
                "type": "CFOSH Facility",
                "latitude": 14.2637731,
                "longitude": 121.3978872,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "I.G.P Building",
                "type": "Building",
                "latitude": 14.2637699,
                "longitude": 121.3982599,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "UDRRMO Building",
                "type": "Building",
                "latitude": 14.2633796,
                "longitude": 121.3985810,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "PDNC Computer Lab",
                "type": "Computer Lab",
                "latitude": 14.2634052,
                "longitude": 121.3984702,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Publication Building And Office (The Gears)",
                "type": "Office",
                "latitude": 14.2631446,
                "longitude": 121.3986302,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Second Gate",
                "type": "Entrance/Exit",
                "latitude": 14.2636769,
                "longitude": 121.3984441,
                "is_routable": True,
            }
        )

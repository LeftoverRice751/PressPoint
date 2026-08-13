"""LocationsTableSeeder Seeder."""

from masoniteorm.seeds import Seeder

from app.models.Locations import Locations


class LocationsTableSeeder(Seeder):
    """The 37 campus locations, as pixel positions on campus-map.png.

    `latitude` holds the Leaflet y and `longitude` holds the x — the columns
    are named for history; every consumer treats them as pixels. Positions
    were digitised on the campus image itself, so they line up with the
    picture the kiosk renders.
    """

    def run(self):
        """Run the database seeds."""
        Locations.create(
            {
                "name": "Main Gate",
                "type": "Entrance/Exit",
                "latitude": 111.0,
                "longitude": 620.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Student Services Building",
                "type": "Building/Entrance",
                "latitude": 141.05,
                "longitude": 583.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Computer Studies (CCS)",
                "type": "Department",
                "latitude": 388.12,
                "longitude": 448.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Auditor's Office",
                "type": "Office",
                "latitude": 230.0,
                "longitude": 593.5,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Supreme Student Building",
                "type": "Building",
                "latitude": 100.21,
                "longitude": 716.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "General Service Office Building (GSO)",
                "type": "Office/Building",
                "latitude": 96.21,
                "longitude": 788.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Multi Purpose Building",
                "type": "Building",
                "latitude": 84.02,
                "longitude": 837.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Administrative Building/Registrar's Office",
                "type": "Building/Office",
                "latitude": 364.1,
                "longitude": 624.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "University library",
                "type": "Library",
                "latitude": 184.07,
                "longitude": 705.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Business Affairs Office (BAO)",
                "type": "Office",
                "latitude": 496.55,
                "longitude": 624.5,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Teacher Education (CTE)",
                "type": "Department",
                "latitude": 580.08,
                "longitude": 474.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Supply Office",
                "type": "Office",
                "latitude": 686.15,
                "longitude": 396.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "University Hotel",
                "type": "Hotel",
                "latitude": 666.49,
                "longitude": 504.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Hospitality Management and Tourism (CHMT)",
                "type": "Department",
                "latitude": 739.14,
                "longitude": 489.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Arts and Sciences (CAS)",
                "type": "Department",
                "latitude": 696.09,
                "longitude": 320.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Business Administration And Accountancy (CBAA)",
                "type": "Department",
                "latitude": 784.11,
                "longitude": 329.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Student Center/ROTC Building",
                "type": "Building",
                "latitude": 846.28,
                "longitude": 98.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Criminal Justice and Education Academic Building (CCJE)",
                "type": "Academic Building",
                "latitude": 878.15,
                "longitude": 222.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Criminal Justice (CCJE)",
                "type": "Department",
                "latitude": 986.34,
                "longitude": 110.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Industrial Technology (CIT)",
                "type": "Department",
                "latitude": 949.14,
                "longitude": 308.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Industrial Technology Academic Building (CIT)",
                "type": "Academic Building",
                "latitude": 1058.17,
                "longitude": 251.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Automotive Building",
                "type": "Building",
                "latitude": 817.08,
                "longitude": 457.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Nursing and Allied Health (CONAH)",
                "type": "Department",
                "latitude": 870.16,
                "longitude": 732.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "University Clinic",
                "type": "Clinic",
                "latitude": 839.13,
                "longitude": 672.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Sports and Kinetics Building",
                "type": "Building",
                "latitude": 770.53,
                "longitude": 730.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "DOST/C-FOSH Building",
                "type": "C FOSH Facility",
                "latitude": 762.53,
                "longitude": 796.25,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Activity Center (AC)",
                "type": "Activity Center",
                "latitude": 578.0,
                "longitude": 796.25,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Engineering Testing Center",
                "type": "Testing Center",
                "latitude": 685.0,
                "longitude": 901.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Senior High School Building",
                "type": "Building",
                "latitude": 688.34,
                "longitude": 992.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Engineering New Building (COE)",
                "type": "Department",
                "latitude": 743.13,
                "longitude": 914.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "College of Engineering Old Building (COE)",
                "type": "Department",
                "latitude": 852.05,
                "longitude": 940.5,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "CFOSH Bakery",
                "type": "CFOSH Facility",
                "latitude": 906.09,
                "longitude": 915.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "I.G.P Building",
                "type": "Building",
                "latitude": 851.15,
                "longitude": 1052.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "UDRRMO Building",
                "type": "Building",
                "latitude": 652.09,
                "longitude": 1112.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "PDNC Computer Lab",
                "type": "Computer Lab",
                "latitude": 678.07,
                "longitude": 1075.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Publication Building And Office (The Gears)",
                "type": "Office",
                "latitude": 553.1,
                "longitude": 1095.0,
                "is_routable": True,
            }
        )

        Locations.create(
            {
                "name": "Second Gate",
                "type": "Entrance/Exit",
                "latitude": 788.16,
                "longitude": 1106.0,
                "is_routable": True,
            }
        )

-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: 127.0.0.1    Database: presspoint
-- ------------------------------------------------------
-- Server version	8.0.46-0ubuntu0.24.04.3

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `locations`
--

DROP TABLE IF EXISTS `locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `locations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `latitude` decimal(12,2) NOT NULL,
  `longitude` decimal(12,2) NOT NULL,
  `is_routable` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `locations`
--

LOCK TABLES `locations` WRITE;
/*!40000 ALTER TABLE `locations` DISABLE KEYS */;
INSERT INTO `locations` VALUES (1,'Main Gate','Entrance/Exit',111.00,620.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(2,'Student Services Building','Building/Entrance',141.05,583.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(3,'College of Computer Studies (CCS)','Department',388.12,448.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(4,'Auditor\'s Office','Office',230.00,593.50,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(5,'Supreme Student Building','Building',100.21,716.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(6,'General Service Office Building (GSO)','Office/Building',96.21,788.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(7,'Multi Purpose Building','Building',84.02,837.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(8,'Administrative Building/Registrar\'s Office','Building/Office',364.10,624.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(9,'University library','Library',184.07,705.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(10,'Business Affairs Office (BAO)','Office',496.55,624.50,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(11,'College of Teacher Education (CTE)','Department',580.08,474.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(12,'Supply Office','Office',686.15,396.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(13,'University Hotel','Hotel',666.49,504.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(14,'College of Hospitality Management and Tourism (CHMT)','Department',739.14,489.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(15,'College of Arts and Sciences (CAS)','Department',696.09,320.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(16,'College of Business Administration And Accountancy (CBAA)','Department',784.11,329.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(17,'Student Center/ROTC Building','Building',846.28,98.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(18,'College of Criminal Justice and Education Academic Building (CCJE)','Academic Building',878.15,222.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(19,'College of Criminal Justice (CCJE)','Department',986.34,110.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(20,'College of Industrial Technology (CIT)','Department',949.14,308.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(21,'College of Industrial Technology Academic Building (CIT)','Academic Building',1058.17,251.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(22,'Automotive Building','Building',817.08,457.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(23,'College of Nursing and Allied Health (CONAH)','Department',870.16,732.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(24,'University Clinic','Clinic',839.13,672.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(25,'Sports and Kinetics Building','Building',770.53,730.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(26,'DOST/C-FOSH Building','C FOSH Facility',762.53,796.25,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(27,'Activity Center (AC)','Activity Center',578.00,796.25,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(28,'Engineering Testing Center','Testing Center',685.00,901.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(29,'Senior High School Building','Building',688.34,992.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(30,'College of Engineering New Building (COE)','Department',743.13,914.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(31,'College of Engineering Old Building (COE)','Department',852.05,940.50,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(32,'CFOSH Bakery','CFOSH Facility',906.09,915.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(33,'I.G.P Building','Building',851.15,1052.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(34,'UDRRMO Building','Building',652.09,1112.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(35,'PDNC Computer Lab','Computer Lab',678.07,1075.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(36,'Publication Building And Office (The Gears)','Office',553.10,1095.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31'),(37,'Second Gate','Entrance/Exit',788.16,1106.00,1,'2026-05-19 01:36:31','2026-05-19 01:36:31');
/*!40000 ALTER TABLE `locations` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-12 16:38:40

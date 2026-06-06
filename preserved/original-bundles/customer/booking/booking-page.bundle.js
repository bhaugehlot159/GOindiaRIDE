// ============================================
        // AUTHENTICATION CHECK
        // ============================================

        function checkAuth() {
            const userRole = localStorage.getItem('userRole');
            const currentUser = localStorage.getItem('currentUser');

            if (userRole !== 'customer' || !currentUser) {
                alert('Please login as customer to book a ride');
                window.location.href = './login.html';
                return null;
            }

            const parsedUser = JSON.parse(currentUser);
            if (customerRowLooksDriver(parsedUser) || !customerRowLooksCustomer(parsedUser)) {
                alert('Please login as customer to book a ride');
                window.location.href = './login.html';
                return null;
            }
            return parsedUser;
        }

        let currentUser = null;
        let selectedDonationAmount = 0;
        let currentRideForDonation = null;
        let appliedPromo = null;
        let latestFareEstimate = null;
        const ADMIN_REVIEW_QUEUE_SIGNAL_KEY = 'goindiaride_admin_review_queue_signal_v1';

        const PROMO_OFFERS = {
            RIDE50: { type: 'flat', value: 50, description: 'Flat INR 50 off on any ride' },
            SAVE10: { type: 'percent', value: 10, max: 250, description: '10% off up to INR 250' },
            AIRPORT100: { type: 'flat', value: 100, tripPlan: 'airport', description: 'Airport transfer flat INR 100 off' },
            GLOBAL15: { type: 'percent', value: 15, max: 400, paymentMethods: ['international_card', 'paypal'], description: '15% off for international payment methods' }
        };

        const CAB_FLOW_CONFIG = {
            airport: {
                label: 'Airport Cabs',
                shortLabel: 'Airport',
                tripPlan: 'airport',
                serviceType: 'airport_transfer',
                notice: 'Airport transfer made easy: add pickup/drop and schedule your ride.',
                packageLabel: 'Airport transfer'
            },
            local: {
                label: 'Local Cabs',
                shortLabel: 'Local',
                tripPlan: 'city',
                serviceType: 'city_local_trip',
                notice: 'Book local city cabs for point-to-point pickup and drop.',
                packageLabel: 'City ride'
            },
            outstation: {
                label: 'Outstation Cabs',
                shortLabel: 'Outstation',
                tripPlan: 'outstation',
                serviceType: 'round_trip_service',
                notice: 'Plan one-way or round-trip intercity rides with transparent fare.',
                packageLabel: 'One way or round trip'
            },
            day_trips: {
                label: 'Day Plan',
                shortLabel: 'Day Plan',
                tripPlan: 'rental',
                serviceType: 'city_local_trip',
                notice: 'Book full-day cab plans with per-day km allowance, extra km billing, and driver preference.',
                packageLabel: '1 Day / 300 kms'
            }
        };
        const CAB_FLOW_TRIP_PLAN_OPTIONS = {
            airport: ['airport'],
            local: ['city'],
            outstation: ['outstation'],
            day_trips: ['rental']
        };
        const CAB_FLOW_SERVICE_TYPE_OPTIONS = {
            airport: ['airport_transfer'],
            local: ['city_local_trip'],
            outstation: ['round_trip_service'],
            day_trips: ['city_local_trip']
        };
        const CAB_DAY_PLAN_PACKAGE_OPTIONS = Array.from({ length: 15 }, (_, index) => {
            const days = index + 1;
            const includedKm = days * 300;
            return {
                value: `day_plan_${days}d`,
                label: `${days} ${days === 1 ? 'Day' : 'Days'} / ${includedKm} kms - Day plan`
            };
        });
        const CAB_DAY_PLAN_PACKAGE_VALUES = CAB_DAY_PLAN_PACKAGE_OPTIONS.map((option) => option.value);
        const AIRPORT_HOURLY_PACKAGE_OPTIONS = [
            { value: 'airport_2h', label: '2 hrs / 20 kms - Airport buffer' },
            { value: 'airport_4h', label: '4 hrs / 40 kms - Airport hourly' },
            { value: 'airport_8h', label: '8 hrs / 80 kms - Airport extended hourly' },
            { value: 'airport_12h', label: '12 hrs / 120 kms - Long airport hourly' }
        ];
        const AIRPORT_FULL_DAY_PACKAGE_OPTIONS = Array.from({ length: 15 }, (_, index) => {
            const days = index + 1;
            const includedKm = days * 300;
            return {
                value: `airport_day_${days}d`,
                label: `${days} ${days === 1 ? 'Day' : 'Days'} / ${includedKm} kms - Airport full-day duty`
            };
        });
        const AIRPORT_PACKAGE_OPTIONS = [
            ...AIRPORT_HOURLY_PACKAGE_OPTIONS,
            ...AIRPORT_FULL_DAY_PACKAGE_OPTIONS
        ];
        const AIRPORT_SERVICE_CONFIG = {
            airport_drop: {
                label: 'Airport Drop',
                notice: 'City, hotel, station or home pickup to selected Indian airport with reporting-time buffer.',
                pickupRole: 'place',
                dropRole: 'airport',
                journeyMode: 'one_way',
                pickupLabel: 'Pickup place',
                dropLabel: 'Airport',
                pickupPlaceholder: 'City, hotel, station or address',
                dropPlaceholder: 'Search destination airport in India',
                terminalLabel: 'Drop terminal',
                terminalPlaceholder: 'Drop terminal/gate, e.g. T1 departures or Gate 4',
                chips: ['Airport drop', 'Reporting buffer', 'Driver details', 'Parking/toll review']
            },
            airport_pickup: {
                label: 'Airport Pickup',
                notice: 'Airport arrival pickup to city, hotel, office or station with flight-delay readiness.',
                pickupRole: 'airport',
                dropRole: 'place',
                journeyMode: 'one_way',
                pickupLabel: 'Airport',
                dropLabel: 'Destination',
                pickupPlaceholder: 'Search arrival airport in India',
                dropPlaceholder: 'City, hotel, office or address',
                terminalLabel: 'Pickup terminal',
                terminalPlaceholder: 'Arrival terminal, gate, pillar or pickup point',
                chips: ['Arrival pickup', 'Flight delay ready', 'Meet & greet note', 'Luggage fit']
            },
            airport_to_airport: {
                label: 'Airport Transfer - Terminal',
                notice: 'Airport transfer covers terminal-to-terminal movement. Choose Return pickup below when the same booking needs a scheduled pickup back.',
                pickupRole: 'airport',
                dropRole: 'airport',
                journeyMode: 'one_way',
                pickupLabel: 'Airport From',
                dropLabel: 'Airport To',
                pickupPlaceholder: 'Search departure airport in India',
                dropPlaceholder: 'Search destination airport in India',
                terminalLabel: 'Terminal details',
                terminalPlaceholder: 'From terminal/gate and destination terminal/gate',
                chips: ['Terminal transfer', 'Airport from/to', 'Flight details', 'Luggage-ready cab']
            },
            airport_round: {
                label: 'Airport Transfer - Return Pickup',
                notice: 'Airport transfer with scheduled return pickup. Add return date and return time for the return leg.',
                pickupRole: 'place',
                dropRole: 'airport',
                journeyMode: 'round_trip',
                requiresReturn: true,
                pickupLabel: 'Pickup place',
                dropLabel: 'Airport',
                pickupPlaceholder: 'City, hotel, station or address',
                dropPlaceholder: 'Search airport for round trip',
                terminalLabel: 'Return terminal',
                terminalPlaceholder: 'Drop terminal and return pickup terminal/gate',
                chips: ['Drop + return pickup', 'Return date/time', 'Waiting ready', 'Same-route clarity']
            },
            airport_hourly: {
                label: 'Airport Hourly',
                notice: 'Airport pickup/drop plus hourly city use for meetings, errands, guest movement or layover work.',
                pickupRole: 'airport',
                dropRole: 'place',
                journeyMode: 'one_way',
                requiresPackage: true,
                defaultPackage: 'airport_4h',
                pickupLabel: 'Airport',
                dropLabel: 'City base',
                pickupPlaceholder: 'Search airport in India',
                dropPlaceholder: 'City area, hotel or office base',
                terminalLabel: 'Airport terminal',
                terminalPlaceholder: 'Airport terminal/gate for pickup or drop',
                chips: ['Hourly package', 'Extra km/hr billed', 'Multiple city stops', 'Layover support']
            },
            airport_day: {
                label: 'Airport Full Day',
                notice: 'Airport full-day duty with 300 km included per day. Extra km, toll/parking/permit, and driver allowance are reviewed before assignment.',
                pickupRole: 'airport',
                dropRole: 'place',
                journeyMode: 'one_way',
                requiresPackage: true,
                optionalStops: true,
                defaultPackage: 'airport_day_1d',
                pickupLabel: 'Airport',
                dropLabel: 'Day base',
                pickupPlaceholder: 'Search airport in India',
                dropPlaceholder: 'City/hotel base for full-day duty',
                terminalLabel: 'Airport terminal',
                terminalPlaceholder: 'Terminal/gate where full-day duty starts',
                chips: ['300 km/day included', 'Extra km billed', 'Driver allowance', 'Toll/parking review']
            },
            airport_multi: {
                label: 'Airport Multi-stop',
                notice: 'Airport pickup/drop with multiple planned stops. Add each route stop below before moving ahead.',
                pickupRole: 'airport',
                dropRole: 'place',
                journeyMode: 'multi_city',
                routeAddons: true,
                pickupLabel: 'Airport',
                dropLabel: 'Final drop',
                pickupPlaceholder: 'Search airport in India',
                dropPlaceholder: 'Final destination after stops',
                terminalLabel: 'Airport terminal',
                terminalPlaceholder: 'Airport terminal/gate before route stops',
                chips: ['Multi-stop', 'Route add-ons', 'Hotel/meeting stops', 'Route-aware fare']
            }
        };
        const INDIA_AIRPORT_SUGGESTIONS = [
            'Veer Savarkar International Airport|Port Blair|Andaman and Nicobar Islands|IXZ|Port Blair Airport',
            'Agatti Airport|Agatti Island|Lakshadweep|AGX|Lakshadweep Airport',
            'Puducherry Airport|Puducherry|Puducherry|PNY|Pondicherry Airport',
            'Chandigarh Airport|Chandigarh|Chandigarh|IXC|Shaheed Bhagat Singh International Airport Chandigarh',
            'Indira Gandhi International Airport|New Delhi|Delhi|DEL|IGI Airport;Delhi Airport',
            'Safdarjung Airport|New Delhi|Delhi||Safdarjung Airfield',
            'Daman Airport|Daman|Dadra and Nagar Haveli and Daman and Diu|NMB|Daman Airfield',
            'Diu Airport|Diu|Dadra and Nagar Haveli and Daman and Diu|DIU|Diu Aerodrome',
            'Jammu Airport|Jammu|Jammu and Kashmir|IXJ|Satwari Airport',
            'Srinagar Airport|Srinagar|Jammu and Kashmir|SXR|Sheikh ul-Alam International Airport',
            'Kushok Bakula Rimpochee Airport|Leh|Ladakh|IXL|Leh Airport',
            'Kadapa Airport|Kadapa|Andhra Pradesh|CDP|Cuddapah Airport',
            'Kurnool Airport|Kurnool|Andhra Pradesh|KJB|Uyyalawada Narasimha Reddy Airport',
            'Rajahmundry Airport|Rajahmundry|Andhra Pradesh|RJA|Rajamahendravaram Airport',
            'Sri Sathya Sai Airport|Puttaparthi|Andhra Pradesh|PUT|Puttaparthi Airport',
            'Tirupati Airport|Tirupati|Andhra Pradesh|TIR|Renigunta Airport',
            'Vijayawada International Airport|Vijayawada|Andhra Pradesh|VGA|Gannavaram Airport',
            'Visakhapatnam International Airport|Visakhapatnam|Andhra Pradesh|VTZ|Vizag Airport',
            'Bhogapuram International Airport|Visakhapatnam|Andhra Pradesh|VOX|Alluri Sitarama Raju International Airport',
            'Donakonda Airport|Donakonda|Andhra Pradesh||Donakonda Airfield',
            'Donyi Polo Airport|Itanagar|Arunachal Pradesh|HGI|Hollongi Airport',
            'Pasighat Airport|Pasighat|Arunachal Pradesh|IXT|Pasighat Advanced Landing Ground',
            'Tezu Airport|Tezu|Arunachal Pradesh|TEI|Tezu ALG',
            'Ziro Airport|Ziro|Arunachal Pradesh|ZER|Ziro ALG',
            'Daporijo Airport|Daporijo|Arunachal Pradesh||Daporijo ALG',
            'Lokpriya Gopinath Bordoloi International Airport|Guwahati|Assam|GAU|Guwahati Airport',
            'Dibrugarh Airport|Dibrugarh|Assam|DIB|Mohanbari Airport',
            'Silchar Airport|Silchar|Assam|IXS|Kumbhirgram Airport',
            'Jorhat Airport|Jorhat|Assam|JRH|Rowriah Airport',
            'Lilabari Airport|North Lakhimpur|Assam|IXI|Lakhimpur Airport',
            'Tezpur Airport|Tezpur|Assam|TEZ|Salonibari Airport',
            'Rupsi Airport|Dhubri|Assam|RUP|Rupsi Aerodrome',
            'Darbhanga Airport|Darbhanga|Bihar|DBR|Darbhanga Civil Enclave',
            'Gaya Airport|Gaya|Bihar|GAY|Bodh Gaya Airport',
            'Jay Prakash Narayan Airport|Patna|Bihar|PAT|Patna Airport',
            'Purnea Airport|Purnea|Bihar||Purnia Airport',
            'Muzaffarpur Airport|Muzaffarpur|Bihar||Muzaffarpur Airfield',
            'Raxaul Airport|Raxaul|Bihar||Raxaul Airstrip',
            'Swami Vivekananda Airport|Raipur|Chhattisgarh|RPR|Raipur Airport',
            'Bilaspur Airport|Bilaspur|Chhattisgarh|PAB|Bilasa Devi Kevat Airport',
            'Jagdalpur Airport|Jagdalpur|Chhattisgarh|JGB|Maa Danteshwari Airport',
            'Maa Mahamaya Airport|Ambikapur|Chhattisgarh||Ambikapur Airport',
            'Raigarh Airport|Raigarh|Chhattisgarh||Raigarh Airstrip',
            'Korba Airport|Korba|Chhattisgarh||Korba Airstrip',
            'Dabolim Airport|Goa|Goa|GOI|Goa International Airport',
            'Manohar International Airport|Mopa|Goa|GOX|Mopa Airport',
            'Sardar Vallabhbhai Patel International Airport|Ahmedabad|Gujarat|AMD|Ahmedabad Airport',
            'Bhavnagar Airport|Bhavnagar|Gujarat|BHU|Bhavnagar Civil Aerodrome',
            'Bhuj Airport|Bhuj|Gujarat|BHJ|Bhuj Rudra Mata Airport',
            'Deesa Airport|Deesa|Gujarat||Deesa Airfield',
            'Dholera International Airport|Dholera|Gujarat||Dholera Airport',
            'Jamnagar Airport|Jamnagar|Gujarat|JGA|Govardhanpur Airport',
            'Kandla Airport|Kandla|Gujarat|IXY|Gandhidham Airport',
            'Keshod Airport|Keshod|Gujarat|IXK|Keshod Aerodrome',
            'Mundra Airport|Mundra|Gujarat|MUN|Mundra Airfield',
            'Porbandar Airport|Porbandar|Gujarat|PBD|Porbandar Civil Aerodrome',
            'Rajkot International Airport|Hirasar|Gujarat|HSR|Hirasar Airport',
            'Rajkot Airport|Rajkot|Gujarat|RAJ|Rajkot Civil Airport',
            'Surat International Airport|Surat|Gujarat|STV|Surat Airport',
            'Vadodara Airport|Vadodara|Gujarat|BDQ|Baroda Airport',
            'Amreli Airport|Amreli|Gujarat||Amreli Airstrip',
            'Ambala Air Force Station|Ambala|Haryana||Ambala Airport',
            'Bhiwani Airport|Bhiwani|Haryana||Bhiwani Aerodrome',
            'Maharaja Agrasen Airport|Hisar|Haryana|HSS|Hisar Airport',
            'Karnal Airport|Karnal|Haryana||Karnal Aerodrome',
            'Narnaul Airport|Narnaul|Haryana||Bachhod Airstrip',
            'Pinjore Airport|Pinjore|Haryana||Pinjore Airstrip',
            'Kangra Airport|Gaggal|Himachal Pradesh|DHM|Dharamshala Airport',
            'Kullu-Manali Airport|Bhuntar|Himachal Pradesh|KUU|Bhuntar Airport',
            'Shimla Airport|Shimla|Himachal Pradesh|SLV|Jubbarhatti Airport',
            'Birsa Munda Airport|Ranchi|Jharkhand|IXR|Ranchi Airport',
            'Bokaro Airport|Bokaro|Jharkhand||Bokaro Aerodrome',
            'Deoghar Airport|Deoghar|Jharkhand|DGH|Baba Baidyanath Airport',
            'Dhanbad Airport|Dhanbad|Jharkhand|DBD|Dhanbad Airstrip',
            'Dumka Airport|Dumka|Jharkhand||Dumka Airport',
            'Sonari Airport|Jamshedpur|Jharkhand|IXW|Jamshedpur Airport',
            'Dhalbhumgarh Airport|Dhalbhumgarh|Jharkhand||Dhalbhumgarh Airfield',
            'Kempegowda International Airport|Bengaluru|Karnataka|BLR|Bangalore Airport',
            'HAL Airport|Bengaluru|Karnataka||Bengaluru HAL Airport',
            'Jakkur Aerodrome|Bengaluru|Karnataka||Jakkur Airport',
            'Belagavi Airport|Belagavi|Karnataka|IXG|Belgaum Airport',
            'Bidar Airport|Bidar|Karnataka|IXX|Bidar Civil Enclave',
            'Hubballi Airport|Hubballi|Karnataka|HBX|Hubli Airport',
            'Kalaburagi Airport|Kalaburagi|Karnataka|GBI|Gulbarga Airport',
            'Mangaluru International Airport|Mangaluru|Karnataka|IXE|Mangalore Airport',
            'Mysuru Airport|Mysuru|Karnataka|MYQ|Mandakalli Airport',
            'Rashtrakavi Kuvempu Airport|Shivamogga|Karnataka|RQY|Shivamogga Airport',
            'Vidyanagar Airport|Ballari|Karnataka|VDY|Jindal Vijaynagar Airport;Toranagallu Airport',
            'Baldota Koppal Aerodrome|Koppal|Karnataka||Baldota Airport',
            'Cochin International Airport|Kochi|Kerala|COK|Kochi Airport',
            'Calicut International Airport|Kozhikode|Kerala|CCJ|Karipur Airport',
            'Kannur International Airport|Kannur|Kerala|CNN|Kannur Airport',
            'Thiruvananthapuram International Airport|Thiruvananthapuram|Kerala|TRV|Trivandrum Airport',
            'Bekal Airport|Bekal|Kerala||Bekal Airstrip',
            'Raja Bhoj Airport|Bhopal|Madhya Pradesh|BHO|Bhopal Airport',
            'Devi Ahilya Bai Holkar Airport|Indore|Madhya Pradesh|IDR|Indore Airport',
            'Jabalpur Airport|Jabalpur|Madhya Pradesh|JLR|Dumna Airport',
            'Rajmata Vijaya Raje Scindia Airport|Gwalior|Madhya Pradesh|GWL|Gwalior Airport',
            'Khajuraho Airport|Khajuraho|Madhya Pradesh|HJR|Khajuraho Civil Aerodrome',
            'Rewa Airport|Rewa|Madhya Pradesh|REW|Rewa Airstrip',
            'Datia Airport|Datia|Madhya Pradesh||Datia Airstrip',
            'Khandwa Airport|Khandwa|Madhya Pradesh||Khandwa Airstrip',
            'Dhana Airport|Sagar|Madhya Pradesh||Sagar Airport',
            'Birlagram Airport|Nagda|Madhya Pradesh||Birlagram Airstrip',
            'Panna Airport|Panna|Madhya Pradesh||Panna Airstrip',
            'Satna Airport|Satna|Madhya Pradesh|TNI|Satna Airstrip',
            'Chhatrapati Shivaji Maharaj International Airport|Mumbai|Maharashtra|BOM|Mumbai Airport',
            'Juhu Aerodrome|Mumbai|Maharashtra||Juhu Airport',
            'Navi Mumbai International Airport|Navi Mumbai|Maharashtra|NMI|D. B. Patil International Airport',
            'Pune Airport|Pune|Maharashtra|PNQ|Lohegaon Airport',
            'Dr. Babasaheb Ambedkar International Airport|Nagpur|Maharashtra|NAG|Nagpur Airport',
            'Chikkalthana Airport|Chhatrapati Sambhajinagar|Maharashtra|IXU|Aurangabad Airport',
            'Nashik Airport|Nashik|Maharashtra|ISK|Ozar Airport',
            'Shirdi Airport|Shirdi|Maharashtra|SAG|Kakadi Airport',
            'Kolhapur Airport|Kolhapur|Maharashtra|KLH|Chhatrapati Rajaram Maharaj Airport',
            'Jalgaon Airport|Jalgaon|Maharashtra|JLG|Jalgaon Aerodrome',
            'Shri Guru Gobind Singh Ji Airport|Nanded|Maharashtra|NDC|Nanded Airport',
            'Sindhudurg Airport|Sindhudurg|Maharashtra|SDW|Chipi Airport',
            'Solapur Airport|Solapur|Maharashtra|SSE|Solapur Airstrip',
            'Akola Airport|Akola|Maharashtra|AKD|Akola Shivani Airport',
            'Amravati Airport|Amravati|Maharashtra||Belora Airport',
            'Baramati Airport|Baramati|Maharashtra||Baramati Airstrip',
            'Gondia Airport|Gondia|Maharashtra|GDB|Birsi Airport',
            'Latur Airport|Latur|Maharashtra|LTU|Latur Airstrip',
            'Osmanabad Airport|Dharashiv|Maharashtra|OMN|Osmanabad Airport',
            'Ratnagiri Airport|Ratnagiri|Maharashtra|RTC|Ratnagiri Airfield',
            'Yavatmal Airport|Yavatmal|Maharashtra||Yavatmal Airstrip',
            'Imphal International Airport|Imphal|Manipur|IMF|Bir Tikendrajit International Airport',
            'Shillong Airport|Shillong|Meghalaya|SHL|Umroi Airport',
            'Shella Airport|Shella|Meghalaya||Shella Airstrip',
            'Lengpui Airport|Aizawl|Mizoram|AJL|Aizawl Airport',
            'Turial Airfield|Turial|Mizoram||Turial Airport',
            'Dimapur Airport|Dimapur|Nagaland|DMU|Dimapur Civil Airport',
            'Biju Patnaik International Airport|Bhubaneswar|Odisha|BBI|Bhubaneswar Airport',
            'Veer Surendra Sai Airport|Jharsuguda|Odisha|JRG|Jharsuguda Airport',
            'Rourkela Airport|Rourkela|Odisha|RRK|Rourkela Civil Airport',
            'Jeypore Airport|Jeypore|Odisha|PYB|Jeypore Aerodrome',
            'Utkela Airport|Utkela|Odisha|UKE|Utkela Airstrip',
            'Berhampur Airport|Berhampur|Odisha||Rangeilunda Airstrip',
            'Birasal Airport|Dhenkanal|Odisha||Birasal Airstrip',
            'Barbil Tonto Aerodrome|Barbil|Odisha||Barbil Airport',
            'Dhamra Airport|Dhamra|Odisha||Dhamra Airstrip',
            'Lanjigarh Airstrip|Lanjigarh|Odisha||Lanjigarh Airport',
            'Malkangiri Airport|Malkangiri|Odisha||Malkangiri Airstrip',
            'Puri International Airport|Puri|Odisha||Sri Jagannath International Airport',
            'Savitri Jindal Airport|Angul|Odisha||Angul Airport',
            'Tusura Airstrip|Balangir|Odisha||Balangir Airport',
            'Sri Guru Ram Dass Jee International Airport|Amritsar|Punjab|ATQ|Amritsar Airport',
            'Bathinda Airport|Bathinda|Punjab|BUP|Bathinda Civil Enclave',
            'Adampur Airport|Jalandhar|Punjab|AIP|Shri Guru Ravidas Airport',
            'Sahnewal Airport|Ludhiana|Punjab|LUH|Ludhiana Airport',
            'Pathankot Airport|Pathankot|Punjab|IXP|Pathankot Civil Airport',
            'Patiala Airport|Patiala|Punjab||Patiala Aviation Complex',
            'Beas Airport|Beas|Punjab||Radha Soami Satsang Beas Airstrip',
            'Shaheed Kartar Singh Sarabha International Airport|Ludhiana|Punjab||Halwara Airport',
            'Jaipur International Airport|Jaipur|Rajasthan|JAI|Sanganer Airport',
            'Maharana Pratap Airport|Udaipur|Rajasthan|UDR|Udaipur Airport;Dabok Airport',
            'Jodhpur Airport|Jodhpur|Rajasthan|JDH|Jodhpur Civil Airport',
            'Jaisalmer Airport|Jaisalmer|Rajasthan|JSA|Jaisalmer Civil Airport',
            'Kishangarh Airport|Ajmer|Rajasthan|KQH|Ajmer Airport',
            'Nal Airport|Bikaner|Rajasthan|BKB|Bikaner Airport',
            'Kota Airport|Kota|Rajasthan|KTU|Kota Aerodrome',
            'Banasthali Airport|Banasthali|Rajasthan||Banasthali Airstrip',
            'Kankroli Airport|Rajsamand|Rajasthan||Kankroli Airstrip',
            'Pakyong Airport|Pakyong|Sikkim|PYG|Gangtok Airport',
            'Chennai International Airport|Chennai|Tamil Nadu|MAA|Meenambakkam Airport',
            'Coimbatore International Airport|Coimbatore|Tamil Nadu|CJB|Coimbatore Airport',
            'Madurai Airport|Madurai|Tamil Nadu|IXM|Madurai Civil Airport',
            'Tiruchirappalli International Airport|Tiruchirappalli|Tamil Nadu|TRZ|Trichy Airport',
            'Salem Airport|Salem|Tamil Nadu|SXV|Salem Civil Airport',
            'Thoothukudi Airport|Thoothukudi|Tamil Nadu|TCR|Tuticorin Airport',
            'Neyveli Airport|Neyveli|Tamil Nadu|NVY|Neyveli Airstrip',
            'Hosur Aerodrome|Hosur|Tamil Nadu||Hosur Airport',
            'Thanjavur Air Force Station|Thanjavur|Tamil Nadu|TJV|Thanjavur Airport',
            'Vellore Airport|Vellore|Tamil Nadu||Vellore Airstrip',
            'Rajiv Gandhi International Airport|Hyderabad|Telangana|HYD|Hyderabad Airport;Shamshabad Airport',
            'Begumpet Airport|Hyderabad|Telangana|BPM|Hyderabad Old Airport',
            'Warangal Airport|Warangal|Telangana|WGC|Mamnoor Airport',
            'Maharaja Bir Bikram Airport|Agartala|Tripura|IXA|Agartala Airport',
            'Kailashahar Airport|Kailashahar|Tripura|IXH|Kailashahar Airstrip',
            'Kamalpur Airport|Kamalpur|Tripura||Kamalpur Airstrip',
            'Khowai Airport|Khowai|Tripura|IXN|Khowai Airstrip',
            'Chaudhary Charan Singh International Airport|Lucknow|Uttar Pradesh|LKO|Lucknow Airport',
            'Lal Bahadur Shastri International Airport|Varanasi|Uttar Pradesh|VNS|Varanasi Airport',
            'Maharishi Valmiki International Airport|Ayodhya|Uttar Pradesh|AYJ|Ayodhya Airport',
            'Prayagraj Airport|Prayagraj|Uttar Pradesh|IXD|Allahabad Airport',
            'Agra Airport|Agra|Uttar Pradesh|AGR|Kheria Airport',
            'Bareilly Airport|Bareilly|Uttar Pradesh|BEK|Bareilly Civil Enclave',
            'Gorakhpur Airport|Gorakhpur|Uttar Pradesh|GOP|Gorakhpur Civil Airport',
            'Kanpur Airport|Kanpur|Uttar Pradesh|KNU|Chakeri Airport',
            'Kushinagar International Airport|Kushinagar|Uttar Pradesh|KBK|Kushinagar Airport',
            'Hindon Airport|Ghaziabad|Uttar Pradesh|HDO|Delhi NCR Hindon Airport',
            'Noida International Airport|Jewar|Uttar Pradesh|DXN|Jewar Airport',
            'Aligarh Airport|Aligarh|Uttar Pradesh|HRH|Dhanipur Airstrip',
            'Azamgarh Airport|Azamgarh|Uttar Pradesh|AZH|Manduri Airport',
            'Chitrakoot Airport|Chitrakoot|Uttar Pradesh|CWK|Chitrakoot Dham Airport',
            'Moradabad Airport|Moradabad|Uttar Pradesh||Moradabad Airstrip',
            'Shravasti Airport|Shravasti|Uttar Pradesh||Shravasti Airstrip',
            'Fursatganj Airfield|Raebareli|Uttar Pradesh||Fursatganj Airport',
            'Sarsawa Airport|Saharanpur|Uttar Pradesh||Saharanpur Airport',
            'Muirpur Airport|Sonbhadra|Uttar Pradesh||Muirpur Airstrip',
            'Meerut Airport|Meerut|Uttar Pradesh||Dr. Bhimrao Ambedkar Airstrip',
            'Jolly Grant Airport|Dehradun|Uttarakhand|DED|Dehradun Airport',
            'Pantnagar Airport|Pantnagar|Uttarakhand|PGH|Pantnagar Civil Aerodrome',
            'Naini Saini Airport|Pithoragarh|Uttarakhand|NNS|Pithoragarh Airport',
            'Netaji Subhas Chandra Bose International Airport|Kolkata|West Bengal|CCU|Kolkata Airport;Dum Dum Airport',
            'Bagdogra International Airport|Siliguri|West Bengal|IXB|Bagdogra Airport',
            'Kazi Nazrul Islam Airport|Durgapur|West Bengal|RDP|Andal Airport',
            'Cooch Behar Airport|Cooch Behar|West Bengal|COH|Cooch Behar Civil Airport',
            'Balurghat Airport|Balurghat|West Bengal|RGH|Balurghat Airfield',
            'Behala Airport|Kolkata|West Bengal||Behala Flying Club',
            'Burnpur Airport|Asansol|West Bengal||Burnpur Airfield',
            'Malda Airport|Malda|West Bengal||Malda Airstrip'
        ].map((row) => {
            const [name, city, state, code, aliases] = row.split('|');
            return {
                name,
                city,
                state,
                code,
                aliases: aliases ? aliases.split(';').filter(Boolean) : []
            };
        });
        let activeAirportServiceMode = 'airport_drop';

        function getCabFlowConfig(flow) {
            return CAB_FLOW_CONFIG[flow] || CAB_FLOW_CONFIG.airport;
        }

        function inferCabFlowFromTripPlan(tripPlan) {
            if (tripPlan === 'outstation') return 'outstation';
            if (tripPlan === 'rental') return 'day_trips';
            if (tripPlan === 'city') return 'local';
            return 'airport';
        }

        function getActiveCabFlow() {
            const hiddenValue = document.getElementById('tripFlow')?.value;
            if (hiddenValue && CAB_FLOW_CONFIG[hiddenValue]) return hiddenValue;
            return inferCabFlowFromTripPlan(document.getElementById('tripPlan')?.value || 'airport');
        }

        function setTextIfPresent(id, value) {
            const node = document.getElementById(id);
            if (node) node.textContent = value;
        }

        function getAirportServiceMode() {
            const hiddenNode = document.getElementById('airportServiceMode');
            const hiddenValue = hiddenNode?.value;
            if (hiddenValue && AIRPORT_SERVICE_CONFIG[hiddenValue]) {
                activeAirportServiceMode = hiddenValue;
            }
            return AIRPORT_SERVICE_CONFIG[activeAirportServiceMode] ? activeAirportServiceMode : 'airport_drop';
        }

        function getAirportServiceConfig(mode = getAirportServiceMode()) {
            return AIRPORT_SERVICE_CONFIG[mode] || AIRPORT_SERVICE_CONFIG.airport_drop;
        }

        function isAirportPackageMode(mode = getAirportServiceMode()) {
            return Boolean(getAirportServiceConfig(mode).requiresPackage);
        }

        function isMergedAirportTransferMode(mode = getAirportServiceMode()) {
            return mode === 'airport_to_airport' || mode === 'airport_round';
        }

        function getAirportPackageOptions(mode = getAirportServiceMode()) {
            return mode === 'airport_day' ? AIRPORT_FULL_DAY_PACKAGE_OPTIONS : AIRPORT_HOURLY_PACKAGE_OPTIONS;
        }

        function getAirportFieldRole(inputId, mode = getAirportServiceMode()) {
            const config = getAirportServiceConfig(mode);
            if (inputId === 'pickup' || inputId === 'cabQuickPickupInput') return config.pickupRole || 'place';
            if (inputId === 'dropoff' || inputId === 'cabQuickDropoffInput') return config.dropRole || 'place';
            return 'place';
        }

        const AIRPORT_TERMINAL_REQUIRED_CODES = new Set(['DEL', 'BOM', 'BLR', 'MAA', 'COK']);

        function getAirportSelectionInputIdsForTerminal() {
            return [
                ['cabQuickPickupInput', 'pickup'],
                ['cabQuickDropoffInput', 'dropoff']
            ].flatMap(([quickInputId, formInputId]) => (
                getAirportFieldRole(quickInputId) === 'airport' ? [quickInputId, formInputId] : []
            ));
        }

        function getResolvedAirportFromInput(inputId) {
            const input = document.getElementById(inputId);
            const value = sanitizeInput(input?.value || '').trim();
            if (!input || !value) return null;
            return getResolvableAirport(value, {
                contextText: getAirportContextTextForInput(input)
            });
        }

        function getAirportTerminalRequirementState() {
            if (getActiveCabFlow() !== 'airport') {
                return { required: false, hasAirportSelection: false, airports: [], requiredAirports: [] };
            }

            const seenAirportKeys = new Set();
            const airports = getAirportSelectionInputIdsForTerminal()
                .map(getResolvedAirportFromInput)
                .filter(Boolean)
                .filter((airport) => {
                    const key = String(airport.code || airport.name || '').toUpperCase();
                    if (!key || seenAirportKeys.has(key)) return false;
                    seenAirportKeys.add(key);
                    return true;
                });
            const requiredAirports = airports.filter((airport) => {
                const code = String(airport.code || '').toUpperCase();
                return AIRPORT_TERMINAL_REQUIRED_CODES.has(code);
            });

            return {
                required: requiredAirports.length > 0,
                hasAirportSelection: airports.length > 0,
                airports,
                requiredAirports
            };
        }

        function isAirportTerminalDetailRequired() {
            return getAirportTerminalRequirementState().required;
        }

        function syncPackageSelectOptions(flow = getActiveCabFlow()) {
            const selectNode = document.getElementById('cabQuickPackageSelect');
            if (!selectNode) return;

            const airportMode = getAirportServiceMode();
            const useAirportPackages = flow === 'airport' && isAirportPackageMode(airportMode);
            const sourceOptions = useAirportPackages ? getAirportPackageOptions(airportMode) : CAB_DAY_PLAN_PACKAGE_OPTIONS;
            const desiredKey = useAirportPackages ? `airport:${airportMode}` : 'local';

            if (selectNode.dataset.packageOptionScope !== desiredKey) {
                selectNode.innerHTML = sourceOptions
                    .map((option) => `<option value="${option.value}">${option.label}</option>`)
                    .join('');
                selectNode.dataset.packageOptionScope = desiredKey;
            }

            if (useAirportPackages) {
                const config = getAirportServiceConfig(airportMode);
                const allowed = new Set(sourceOptions.map((option) => option.value));
                if (!allowed.has(selectNode.value)) {
                    selectNode.value = config.defaultPackage || sourceOptions[0]?.value || '';
                }
                return;
            }

            const allowedDayPlan = new Set(CAB_DAY_PLAN_PACKAGE_VALUES);
            if (!allowedDayPlan.has(selectNode.value)) {
                selectNode.value = CAB_DAY_PLAN_PACKAGE_OPTIONS[0]?.value || '';
            }
        }

        function syncAirportServiceChips(mode = getAirportServiceMode()) {
            document.querySelectorAll('[data-airport-service]').forEach((button) => {
                const isTransferGroup = button.dataset.airportServiceGroup === 'airport_transfer';
                const isActive = button.dataset.airportService === mode
                    || (isTransferGroup && isMergedAirportTransferMode(mode));
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
            document.querySelectorAll('[data-airport-transfer-variant]').forEach((button) => {
                const isActive = button.dataset.airportTransferVariant === mode;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        }

        function setAirportServiceMode(mode, options = {}) {
            const previousMode = getAirportServiceMode();
            const safeMode = AIRPORT_SERVICE_CONFIG[mode] ? mode : 'airport_drop';
            const config = getAirportServiceConfig(safeMode);
            const modeChanged = previousMode !== safeMode;
            activeAirportServiceMode = safeMode;
            const hiddenNode = document.getElementById('airportServiceMode');
            if (hiddenNode) hiddenNode.value = safeMode;

            syncAirportServiceChips(safeMode);
            const isAirportFlow = getActiveCabFlow() === 'airport';
            document.getElementById('cabBookingConsole')?.classList.toggle('is-airport-transfer', isAirportFlow && isMergedAirportTransferMode(safeMode));
            if (!isAirportFlow) return;

            if (modeChanged && options.preserveFields !== true) {
                ['pickup', 'dropoff', 'cabQuickPickupInput', 'cabQuickDropoffInput', 'cabQuickTerminalInput', 'returnDate', 'returnTime', 'cabQuickReturnDateInput', 'cabQuickReturnTimeInput']
                    .forEach((inputId) => {
                        const input = document.getElementById(inputId);
                        if (input) input.value = '';
                    });
                getRouteStopInputs().forEach((input) => {
                    input.value = '';
                });
                updateRouteStopLabels();
            }

            setCabJourneyMode(config.journeyMode || 'one_way', {
                syncReturnTrip: true,
                skipFare: true
            });
            syncPackageSelectOptions('airport');
            if (modeChanged && config.requiresPackage && config.defaultPackage) {
                const packageSelect = document.getElementById('cabQuickPackageSelect');
                if (packageSelect) packageSelect.value = config.defaultPackage;
            }
            syncAirportOnlyFieldUi('airport');
            resetCabLayerProgress('airport');
            syncCabRoundTripUi('airport');
            syncCabLayerFlow('airport');
            if (options.skipFare !== true) updateFare();
            else updateBookingExperience();
        }

        function normalizeAirportSearchText(value) {
            return String(value || '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function escapeBookingHtml(value) {
            return String(value || '').replace(/[&<>"']/g, (character) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[character]));
        }

        function escapeBookingRegex(value) {
            return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function formatAirportSuggestion(airport) {
            if (!airport) return '';
            const code = airport.code ? ` (${airport.code})` : '';
            return `${airport.name}${code}, ${airport.city}, ${airport.state}`;
        }

        function getAirportSearchScore(airport, normalizedQuery) {
            const code = normalizeAirportSearchText(airport.code);
            const name = normalizeAirportSearchText(airport.name);
            const city = normalizeAirportSearchText(airport.city);
            const state = normalizeAirportSearchText(airport.state);
            const formatted = normalizeAirportSearchText(formatAirportSuggestion(airport));
            const aliases = Array.isArray(airport.aliases)
                ? airport.aliases.map(normalizeAirportSearchText)
                : [];
            const haystack = [formatted, code, name, city, state, ...aliases].filter(Boolean).join(' ');

            if (!normalizedQuery) return null;
            if (code && code === normalizedQuery) return 0;
            if (formatted.startsWith(normalizedQuery)) return 1;
            if (city.startsWith(normalizedQuery)) return 1;
            if (name.startsWith(normalizedQuery)) return 2;
            if (aliases.some((alias) => alias.startsWith(normalizedQuery))) return 3;
            if (state.startsWith(normalizedQuery)) return 4;
            if (haystack.includes(normalizedQuery)) return 5;
            const queryTokens = normalizedQuery.split(' ').filter(Boolean);
            const haystackTokens = haystack.split(' ').filter(Boolean);
            const allTokensResolvable = queryTokens.every((token, index) => {
                if (index === queryTokens.length - 1) {
                    return haystackTokens.some((part) => part.startsWith(token));
                }
                return haystackTokens.includes(token);
            });
            if (allTokensResolvable) return 6;
            return null;
        }

        function getAirportInputPairId(inputId) {
            return {
                pickup: 'dropoff',
                dropoff: 'pickup',
                cabQuickPickupInput: 'cabQuickDropoffInput',
                cabQuickDropoffInput: 'cabQuickPickupInput'
            }[inputId] || '';
        }

        function getAirportContextTextForInput(input) {
            if (!input || !input.id) return '';
            const pairedInputId = getAirportInputPairId(input.id);
            const pairedInput = pairedInputId ? document.getElementById(pairedInputId) : null;
            if (!pairedInput || getAirportFieldRole(pairedInputId) === 'airport') return '';
            return sanitizeInput(pairedInput.value || '').trim();
        }

        function getMeaningfulAirportTokens(value) {
            const ignoredTokens = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'india', 'indian', 'of', 'the', 'to']);
            return normalizeAirportSearchText(value)
                .split(' ')
                .filter((token) => token.length > 1 && !ignoredTokens.has(token));
        }

        function getAirportContextScore(airport, contextText) {
            const normalizedContext = normalizeAirportSearchText(contextText);
            if (!normalizedContext) return 0;

            const city = normalizeAirportSearchText(airport.city);
            const state = normalizeAirportSearchText(airport.state);
            const name = normalizeAirportSearchText(airport.name);
            const aliases = Array.isArray(airport.aliases)
                ? airport.aliases.map(normalizeAirportSearchText)
                : [];
            const airportTokens = getMeaningfulAirportTokens([
                city,
                state,
                name,
                airport.code,
                ...aliases
            ].join(' '));
            const contextTokens = getMeaningfulAirportTokens(normalizedContext);
            const contextHasCity = Boolean(city && (normalizedContext.includes(city) || city.includes(normalizedContext)));
            const contextHasState = Boolean(state && normalizedContext.includes(state));
            const cityTokenOverlap = getMeaningfulAirportTokens(city).some((token) => contextTokens.includes(token));
            const aliasTokenOverlap = aliases.some((alias) => {
                const aliasTokens = getMeaningfulAirportTokens(alias);
                return aliasTokens.some((token) => contextTokens.includes(token));
            });
            const nameTokenOverlap = getMeaningfulAirportTokens(name).some((token) => contextTokens.includes(token));
            const airportTokenOverlap = airportTokens.some((token) => contextTokens.includes(token));

            if (contextHasCity) return 100;
            if (cityTokenOverlap) return 90;
            if (aliasTokenOverlap) return 80;
            if (nameTokenOverlap) return 70;
            if (airportTokenOverlap && contextTokens.length > 1) return 40;
            if (contextHasState) return 10;
            return 0;
        }

        function isBroadAirportQuery(value) {
            const tokens = getMeaningfulAirportTokens(value);
            if (tokens.length !== 1) return false;
            return new Set(['airport', 'airports', 'domestic', 'international', 'rajasthan', 'terminal']).has(tokens[0]);
        }

        function getRankedAirportMatches(query, options = {}) {
            const normalizedQuery = normalizeAirportSearchText(query);
            if (normalizedQuery.length < 2) return [];

            const contextText = sanitizeInput(options.contextText || '').trim();
            return INDIA_AIRPORT_SUGGESTIONS
                .map((airport) => ({
                    airport,
                    score: getAirportSearchScore(airport, normalizedQuery),
                    contextScore: getAirportContextScore(airport, contextText)
                }))
                .filter((entry) => entry.score !== null)
                .sort((a, b) => {
                    if (a.contextScore !== b.contextScore) return b.contextScore - a.contextScore;
                    if (a.score !== b.score) return a.score - b.score;
                    return formatAirportSuggestion(a.airport).localeCompare(formatAirportSuggestion(b.airport));
                })
                .slice(0, 18);
        }

        function searchIndianAirports(query, options = {}) {
            return getRankedAirportMatches(query, options).map((entry) => entry.airport);
        }

        function findExactAirportMatch(value) {
            const normalizedValue = normalizeAirportSearchText(value);
            if (!normalizedValue) return null;

            return INDIA_AIRPORT_SUGGESTIONS.find((airport) => {
                const candidates = [
                    formatAirportSuggestion(airport),
                    airport.name,
                    airport.city,
                    airport.code,
                    ...((Array.isArray(airport.aliases) && airport.aliases) || [])
                ].map(normalizeAirportSearchText).filter(Boolean);

                return candidates.includes(normalizedValue);
            }) || null;
        }

        function getResolvableAirport(value, options = {}) {
            const exactMatch = findExactAirportMatch(value);
            if (exactMatch) return exactMatch;
            const matches = getRankedAirportMatches(value, options);
            if (!matches.length) return null;
            const [bestMatch, secondMatch] = matches;
            if (bestMatch.contextScore > 0 && (!secondMatch || bestMatch.contextScore > secondMatch.contextScore)) {
                return bestMatch.airport;
            }
            if (bestMatch.score <= 3 && (!secondMatch || bestMatch.score < secondMatch.score)) {
                return bestMatch.airport;
            }
            return matches.length === 1 ? matches[0].airport : null;
        }

        function isAirportTextResolvable(value, options = {}) {
            return Boolean(getResolvableAirport(value, options));
        }

        function getBookingAutocompleteBox(input) {
            if (!input || !input.id) return null;
            const existing = document.getElementById(`${input.id}Autocomplete`);
            if (existing) return existing;

            const suggestions = document.createElement('div');
            suggestions.id = `${input.id}Autocomplete`;
            suggestions.className = 'autocomplete-suggestions';
            document.body.appendChild(suggestions);
            return suggestions;
        }

        function getBookingConsoleActionRow(input) {
            const consoleNode = input?.closest?.('#cabBookingConsole') || document.getElementById('cabBookingConsole');
            return consoleNode?.querySelector?.('.cab-console-actions') || null;
        }

        function resetBookingAutocompleteActionGap() {
            document.querySelectorAll('#cabBookingConsole .cab-console-actions').forEach((actions) => {
                if (actions.dataset.bookingAutocompleteGap === '1') {
                    actions.style.removeProperty('margin-top');
                    delete actions.dataset.bookingAutocompleteGap;
                    delete actions.dataset.bookingAutocompleteGapKey;
                }
            });
        }

        function reserveBookingAutocompleteActionGap(input, suggestionsBox) {
            if (!input || !suggestionsBox || !input.closest('#cabBookingConsole')) return;
            const actions = getBookingConsoleActionRow(input);
            if (!actions) return;

            if (!actions.dataset.bookingBaseMarginTop) {
                actions.dataset.bookingBaseMarginTop = window.getComputedStyle(actions).marginTop || '0px';
            }

            const desiredHeight = Math.min(260, suggestionsBox.scrollHeight || 180);
            const gapKey = `${input.id || 'input'}:${Math.round(desiredHeight)}`;
            if (actions.dataset.bookingAutocompleteGap === '1'
                && actions.dataset.bookingAutocompleteGapKey === gapKey) {
                return;
            }

            actions.style.removeProperty('margin-top');
            delete actions.dataset.bookingAutocompleteGap;
            delete actions.dataset.bookingAutocompleteGapKey;

            const inputRect = input.getBoundingClientRect();
            const actionTop = actions.getBoundingClientRect().top;
            const requiredBottom = inputRect.bottom + desiredHeight + 12;
            const extraGap = Math.max(0, requiredBottom - actionTop);
            if (!extraGap) return;

            const baseGap = Number.parseFloat(actions.dataset.bookingBaseMarginTop || '0') || 0;
            actions.style.setProperty('margin-top', `${baseGap + extraGap}px`, 'important');
            actions.dataset.bookingAutocompleteGap = '1';
            actions.dataset.bookingAutocompleteGapKey = gapKey;
        }

        function positionBookingAutocompleteBox(input, suggestionsBox) {
            if (!input || !suggestionsBox) return;
            reserveBookingAutocompleteActionGap(input, suggestionsBox);

            const rect = input.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            if (!viewportWidth || !viewportHeight || rect.width <= 0 || rect.height <= 0) return;

            const margin = 8;
            const width = Math.min(Math.max(260, rect.width), Math.max(260, viewportWidth - margin * 2));
            const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
            const spaceBelow = viewportHeight - rect.bottom - margin;
            const actionRow = document.querySelector('#cabBookingConsole .cab-console-actions');
            const actionTop = actionRow?.getBoundingClientRect?.().top || 0;
            const actionSpace = actionTop > rect.bottom ? actionTop - rect.bottom - 10 : spaceBelow;
            const desiredHeight = suggestionsBox.scrollHeight || 260;
            const maxHeight = Math.max(80, Math.min(260, desiredHeight, spaceBelow - 4, actionSpace));

            suggestionsBox.style.position = 'fixed';
            suggestionsBox.style.left = `${left}px`;
            suggestionsBox.style.width = `${width}px`;
            suggestionsBox.style.maxHeight = `${maxHeight}px`;
            suggestionsBox.style.marginTop = '0';
            suggestionsBox.style.zIndex = '9999';
            suggestionsBox.style.top = `${Math.min(viewportHeight - margin - 40, rect.bottom - 1)}px`;
            suggestionsBox.style.borderTop = 'none';
            suggestionsBox.style.borderBottom = '2px solid #1689bf';
            suggestionsBox.style.borderRadius = '0 0 8px 8px';
        }

        function closeAirportAutocompleteBoxes() {
            ['pickup', 'dropoff', 'cabQuickPickupInput', 'cabQuickDropoffInput'].forEach((inputId) => {
                const box = document.getElementById(`${inputId}Autocomplete`);
                if (!box) return;
                box.innerHTML = '';
                box.style.display = 'none';
            });
            resetBookingAutocompleteActionGap();
        }

        function closeAllBookingAutocompleteBoxes() {
            document.querySelectorAll('.autocomplete-suggestions').forEach((box) => {
                box.innerHTML = '';
                box.style.display = 'none';
            });
            resetBookingAutocompleteActionGap();
        }

        function capBookingAutocompleteBox(input, suggestionsBox) {
            if (!input || !suggestionsBox || !input.closest('#cabBookingConsole')) return;
            reserveBookingAutocompleteActionGap(input, suggestionsBox);

            const inputRect = input.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const margin = 8;
            const actionRow = document.querySelector('#cabBookingConsole .cab-console-actions');
            const actionTop = actionRow?.getBoundingClientRect?.().top || 0;
            const actionSpace = actionTop > inputRect.bottom ? actionTop - inputRect.bottom - 10 : viewportHeight - inputRect.bottom - margin;
            const desiredHeight = suggestionsBox.scrollHeight || 260;
            const maxHeight = Math.max(80, Math.min(260, desiredHeight, viewportHeight - inputRect.bottom - margin - 4, actionSpace));

            suggestionsBox.style.maxHeight = `${maxHeight}px`;
            suggestionsBox.style.top = `${Math.min(viewportHeight - margin - 40, inputRect.bottom - 1)}px`;
            suggestionsBox.style.borderTop = 'none';
            suggestionsBox.style.borderBottom = '2px solid #667eea';
            suggestionsBox.style.borderRadius = '0 0 8px 8px';
        }

        function isBookingAutocompleteInternalScroll(event) {
            const target = event?.target;
            return Boolean(target?.closest?.('.autocomplete-suggestions'));
        }

        function patchBookingLocationAutocompletePositioner() {
            const Ctor = window.LocationAutocomplete;
            if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.positionSuggestions !== 'function') return false;
            if (Ctor.prototype.__goiBookingActionCapPatched) return true;

            const bindBookingSuggestionSelection = (instance) => {
                const input = instance?.input;
                const suggestionsBox = instance?.suggestionsBox;
                if (!input?.closest?.('#cabBookingConsole') || !suggestionsBox) return;
                if (input.id !== 'cabQuickPickupInput' && input.id !== 'cabQuickDropoffInput') return;

                suggestionsBox.querySelectorAll('.autocomplete-item').forEach((item) => {
                    if (item.dataset.bookingPointerSelect === '1') return;
                    item.dataset.bookingPointerSelect = '1';
                    let selectionHandled = false;
                    const selectVisibleItem = (event) => {
                        if (event) {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                        if (selectionHandled) return;
                        const value = sanitizeInput(item.textContent || '').trim();
                        if (!value) return;
                        selectionHandled = true;
                        instance.selectItem(value);
                    };
                    item.addEventListener('pointerdown', selectVisibleItem);
                    item.addEventListener('click', selectVisibleItem);
                });
            };

            const originalPosition = Ctor.prototype.positionSuggestions;
            Ctor.prototype.positionSuggestions = function bookingActionCappedPositionSuggestions() {
                if (this.input?.closest?.('#cabBookingConsole') && !this.__goiDownwardBound) {
                    this.__goiDownwardBound = true;
                }
                originalPosition.call(this);
                capBookingAutocompleteBox(this.input, this.suggestionsBox);
            };
            if (typeof Ctor.prototype.init === 'function') {
                const originalInit = Ctor.prototype.init;
                Ctor.prototype.init = function bookingStableAutocompleteInit() {
                    originalInit.call(this);
                    if (!this.input?.closest?.('#cabBookingConsole') || this.__goiBookingStableScrollBound) return;
                    document.removeEventListener('scroll', this.boundReposition, true);

                    let scrollFrame = null;
                    this.boundBookingReposition = (event) => {
                        if (isBookingAutocompleteInternalScroll(event)) return;
                        if (!this.suggestionsBox || this.suggestionsBox.style.display !== 'block') return;
                        if (scrollFrame) return;

                        scrollFrame = window.requestAnimationFrame(() => {
                            scrollFrame = null;
                            if (this.suggestionsBox && this.suggestionsBox.style.display === 'block') {
                                this.positionSuggestions();
                            }
                        });
                    };
                    document.addEventListener('scroll', this.boundBookingReposition, true);
                    this.__goiBookingStableScrollBound = true;
                };
            }
            if (typeof Ctor.prototype.displaySuggestions === 'function') {
                const originalDisplaySuggestions = Ctor.prototype.displaySuggestions;
                Ctor.prototype.displaySuggestions = function bookingSelectableDisplaySuggestions(suggestions) {
                    originalDisplaySuggestions.call(this, suggestions);
                    bindBookingSuggestionSelection(this);
                };
            }
            if (typeof Ctor.prototype.selectItem === 'function') {
                const originalSelectItem = Ctor.prototype.selectItem;
                Ctor.prototype.selectItem = function bookingTrackedSelectItem(value) {
                    if (this.input?.closest?.('#cabBookingConsole')) {
                        this.input.dataset.cabCommittedSelection = '1';
                    }
                    originalSelectItem.call(this, value);
                };
            }
            if (typeof Ctor.prototype.closeSuggestions === 'function') {
                const originalCloseSuggestions = Ctor.prototype.closeSuggestions;
                Ctor.prototype.closeSuggestions = function bookingTrackedCloseSuggestions() {
                    originalCloseSuggestions.call(this);
                    if (this.input?.closest?.('#cabBookingConsole')) {
                        resetBookingAutocompleteActionGap();
                    }
                };
            }
            Ctor.prototype.__goiBookingActionCapPatched = true;
            return true;
        }

        function getAutocompleteDisplayTextFromBox(input) {
            if (!input || !input.id) return '';
            const box = document.getElementById(`${input.id}Autocomplete`);
            const firstItem = box?.querySelector('.autocomplete-item');
            return sanitizeInput(firstItem?.textContent || '').trim();
        }

        function getGenericLocationAutocompleteMatches(value) {
            const query = normalizeAirportSearchText(value);
            if (query.length < 2 || typeof window.LocationAutocomplete !== 'function') return [];

            try {
                const resolver = Object.create(window.LocationAutocomplete.prototype);
                resolver.data = window.locationsData || { states: {}, rajasthan: {} };
                resolver.maxResults = 12;
                resolver.minSearchLength = 2;
                return resolver.searchLocations(query)
                    .filter((item) => item && !item.isCategory && item.display)
                    .map((item) => sanitizeInput(item.display).trim())
                    .filter(Boolean);
            } catch (_error) {
                return [];
            }
        }

        function getResolvableGenericLocation(value) {
            const rawValue = sanitizeInput(value || '').trim();
            const normalizedValue = normalizeAirportSearchText(rawValue);
            if (normalizedValue.length < 2) return '';

            const matches = getGenericLocationAutocompleteMatches(rawValue);
            if (!matches.length) return '';

            const exactMatch = matches.find((match) => normalizeAirportSearchText(match) === normalizedValue);
            if (exactMatch) return exactMatch;

            const startsWithMatch = matches.find((match) => normalizeAirportSearchText(match).startsWith(normalizedValue));
            return startsWithMatch || matches[0] || '';
        }

        function showQuickGenericAutocomplete(input, queryOverride = '') {
            if (!input || !input.id || !input.closest('#cabBookingConsole')) return false;
            if (getActiveCabFlow() === 'airport' && getAirportFieldRole(input.id) === 'airport') return false;

            const query = String(queryOverride || input.value || '').trim();
            const suggestionsBox = getBookingAutocompleteBox(input);
            if (!suggestionsBox) return false;

            suggestionsBox.dataset.airportScoped = '0';
            suggestionsBox.innerHTML = '';

            if (query.length < 2) {
                suggestionsBox.style.display = 'none';
                return true;
            }

            const matches = getGenericLocationAutocompleteMatches(query);
            suggestionsBox.style.display = 'block';

            const header = document.createElement('div');
            header.className = 'autocomplete-category';
            header.textContent = 'Locations';
            suggestionsBox.appendChild(header);

            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'autocomplete-no-results';
                empty.textContent = 'No location found';
                suggestionsBox.appendChild(empty);
                positionBookingAutocompleteBox(input, suggestionsBox);
                return true;
            }

            matches.forEach((match, index) => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.dataset.index = String(index);
                item.innerHTML = `<span>${highlightAirportSuggestionText(match, query)}</span>`;
                let selectionHandled = false;
                const selectMatch = (event) => {
                    if (event) event.preventDefault();
                    if (selectionHandled) return;
                    selectionHandled = true;
                    input.value = match;
                    input.dataset.cabCommittedSelection = '1';
                    delete input.dataset.cabAutoResolvedSource;
                    delete input.dataset.cabAutoResolvedValue;
                    syncAirportPairedInput(input.id, match);
                    closeAllBookingAutocompleteBoxes();
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    updateBookingExperience();
                };
                item.addEventListener('pointerdown', selectMatch);
                item.addEventListener('click', selectMatch);
                suggestionsBox.appendChild(item);
            });

            positionBookingAutocompleteBox(input, suggestionsBox);
            return true;
        }

        function syncAirportPairedInput(inputId, value) {
            const pairedInputId = {
                pickup: 'cabQuickPickupInput',
                cabQuickPickupInput: 'pickup',
                dropoff: 'cabQuickDropoffInput',
                cabQuickDropoffInput: 'dropoff'
            }[inputId];
            const pairedInput = pairedInputId ? document.getElementById(pairedInputId) : null;
            if (pairedInput && pairedInput.value !== value) {
                pairedInput.value = value;
            }
        }

        const BOOKING_OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const BOOKING_OSM_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
        const BOOKING_OSM_GEOCODE_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
        const BOOKING_OSM_GEOCODE_MIN_GAP_MS = 1100;
        const BOOKING_OSM_GEOCODE_CACHE_MAX_ENTRIES = 120;
        const BOOKING_EXACT_LOCATION_STORAGE_KEY = 'goindiaride_booking_exact_locations_v1';
        const BOOKING_GOOGLE_MAP_DEFAULT_CENTER = { lat: 24.5854, lng: 73.7125 };
        const BOOKING_GPS_TARGET_ACCURACY_METERS = 35;
        const BOOKING_GPS_WEAK_ACCURACY_METERS = 120;
        const BOOKING_GPS_FIRST_FIX_TIMEOUT_MS = 8000;
        const BOOKING_GPS_REFINE_WINDOW_MS = 6000;
        const BOOKING_GPS_INSTANT_FIX_TIMEOUT_MS = 1800;
        const BOOKING_GPS_INSTANT_MAX_AGE_MS = 180000;
        const BOOKING_GPS_QUICK_FIX_TIMEOUT_MS = 2500;
        const BOOKING_GPS_QUICK_MAX_AGE_MS = 12000;
        const BOOKING_GPS_QUICK_ACCEPT_ACCURACY_METERS = 85;
        const BOOKING_GPS_REFINE_MAX_DRIFT_METERS = 3500;
        const BOOKING_GPS_WARM_CACHE_MAX_AGE_MS = 180000;
        const BOOKING_REVERSE_GEOCODE_CACHE_STORAGE_KEY = 'goindiaride_booking_reverse_geocode_cache_v3';
        const BOOKING_REVERSE_GEOCODE_LEGACY_CACHE_KEYS = [
            'goindiaride_booking_reverse_geocode_cache_v1',
            'goindiaride_booking_reverse_geocode_cache_v2'
        ];
        const BOOKING_REVERSE_GEOCODE_MIN_ACCEPT_SCORE = 6;
        const BOOKING_REVERSE_GEOCODE_PRIMARY_ACCEPT_SCORE = 8;
        const BOOKING_REVERSE_GEOCODE_CACHE_MAX_ENTRIES = 80;
        const BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION = 5;
        const BOOKING_REVERSE_GEOCODE_FALLBACK_PRECISION = 4;
        const bookingGoogleMapState = {
            activeTarget: 'pickup',
            coords: { pickup: null, dropoff: null, stop: null },
            geocoder: null,
            placesService: null,
            leafletLoadingPromise: null,
            osmGeocodeQueue: Promise.resolve(),
            osmGeocodeLastRequestAt: 0,
            osmGeocodeCache: new Map(),
            osmGeocodePending: new Map(),
            inputTimer: null,
            map: null,
            mapReady: false,
            markers: { pickup: null, dropoff: null, stop: null },
            routeLine: null,
            reverseGeocodeCacheLoaded: false,
            reverseGeocodeCache: new Map(),
            reverseGeocodePending: new Map(),
            warmCurrentLocation: null,
            warmCurrentLocationPromise: null
        };

        function setBookingMapStatus(message, state = 'info') {
            const statusNode = document.getElementById('bookingMapStatus');
            if (!statusNode) return;
            statusNode.textContent = message;
            statusNode.dataset.state = state;
        }

        function setBookingMapActiveTarget(target = 'pickup') {
            bookingGoogleMapState.activeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            document.querySelectorAll('[data-map-target]').forEach((button) => {
                button.classList.toggle('is-active', button.dataset.mapTarget === bookingGoogleMapState.activeTarget);
            });
        }

        function queueBookingOsmGeocodeTask(task) {
            const safeTask = typeof task === 'function' ? task : null;
            if (!safeTask) return Promise.resolve(null);
            bookingGoogleMapState.osmGeocodeQueue = bookingGoogleMapState.osmGeocodeQueue
                .catch(() => null)
                .then(async () => {
                    const elapsed = Date.now() - Number(bookingGoogleMapState.osmGeocodeLastRequestAt || 0);
                    if (elapsed < BOOKING_OSM_GEOCODE_MIN_GAP_MS) {
                        await new Promise((resolve) => window.setTimeout(resolve, BOOKING_OSM_GEOCODE_MIN_GAP_MS - elapsed));
                    }
                    bookingGoogleMapState.osmGeocodeLastRequestAt = Date.now();
                    return safeTask();
                });
            return bookingGoogleMapState.osmGeocodeQueue;
        }

        async function ensureBookingLeafletRuntime() {
            if (window.L?.map) return true;
            if (bookingGoogleMapState.leafletLoadingPromise) return bookingGoogleMapState.leafletLoadingPromise;
            bookingGoogleMapState.leafletLoadingPromise = new Promise((resolve) => {
                const done = () => resolve(Boolean(window.L?.map));
                if (!document.querySelector('link[data-booking-leaflet-css="1"]')) {
                    const css = document.createElement('link');
                    css.rel = 'stylesheet';
                    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                    css.dataset.bookingLeafletCss = '1';
                    document.head.appendChild(css);
                }
                if (window.L?.map) {
                    done();
                    return;
                }
                const existingScript = document.querySelector('script[data-booking-leaflet-js="1"]');
                if (existingScript) {
                    existingScript.addEventListener('load', done, { once: true });
                    existingScript.addEventListener('error', () => resolve(false), { once: true });
                    return;
                }
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                script.async = true;
                script.dataset.bookingLeafletJs = '1';
                script.onload = done;
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });
            return bookingGoogleMapState.leafletLoadingPromise;
        }

        async function ensureBookingGoogleMapReady() {
            const mapNode = document.getElementById('bookingGoogleMap');
            if (bookingGoogleMapState.geocoder && (bookingGoogleMapState.mapReady || !mapNode)) return true;
            bookingGoogleMapState.geocoder = { provider: 'osm_nominatim' };
            bookingGoogleMapState.placesService = null;

            if (!mapNode) {
                updateBookingGoogleMapRouteLink();
                return true;
            }
            try {
                const ready = await ensureBookingLeafletRuntime();
                if (!ready || !window.L?.map) {
                    setBookingMapStatus('Map preview unavailable. Location features are still active.', 'warning');
                    updateBookingGoogleMapRouteLink();
                    return true;
                }

                if (!bookingGoogleMapState.map) {
                    bookingGoogleMapState.map = window.L.map(mapNode, {
                        zoomControl: true,
                        attributionControl: true
                    }).setView([BOOKING_GOOGLE_MAP_DEFAULT_CENTER.lat, BOOKING_GOOGLE_MAP_DEFAULT_CENTER.lng], 11);
                    window.L.tileLayer(BOOKING_OSM_TILE_URL, {
                        attribution: BOOKING_OSM_TILE_ATTRIBUTION,
                        maxZoom: 19
                    }).addTo(bookingGoogleMapState.map);
                    bookingGoogleMapState.map.on('click', (event) => {
                        const latlng = event?.latlng;
                        if (!latlng) return;
                        applyBookingMapCoordinates(bookingGoogleMapState.activeTarget, {
                            lat: latlng.lat,
                            lng: latlng.lng
                        }, { source: 'map' });
                    });
                }
                bookingGoogleMapState.mapReady = true;
                mapNode.classList.add('is-ready');
                window.setTimeout(() => {
                    if (bookingGoogleMapState.map?.invalidateSize) {
                        bookingGoogleMapState.map.invalidateSize();
                    }
                }, 120);
                setBookingMapStatus('OpenStreetMap ready. Tap map to set exact pickup/drop.', 'info');
                syncBookingMapFromInputs();
                return true;
            } catch (_error) {
                setBookingMapStatus('Map preview unavailable. Location features are still active.', 'warning');
                updateBookingGoogleMapRouteLink();
                return true;
            }
        }

        function getBookingMapInputValue(target) {
            if (target === 'stop') {
                return getRouteStopInputs()
                    .map((input) => sanitizeInput(input.value || '').trim())
                    .find(Boolean) || '';
            }
            const inputIds = target === 'dropoff'
                ? ['dropoff', 'cabQuickDropoffInput']
                : ['pickup', 'cabQuickPickupInput'];
            return inputIds
                .map((id) => sanitizeInput(document.getElementById(id)?.value || '').trim())
                .find(Boolean) || '';
        }

        function getBookingMapRouteStops() {
            return typeof readRouteStops === 'function' ? readRouteStops() : [];
        }

        function parseBookingMapLatLngToken(value) {
            const text = sanitizeInput(value || '').trim();
            const match = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
            if (!match) return null;
            const lat = Number(match[1]);
            const lng = Number(match[2]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
            return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
        }

        function buildBookingGoogleMapsUrl() {
            const pickup = getBookingMapQueryValue('pickup');
            const dropoff = getBookingMapQueryValue('dropoff');
            const stops = getRouteStopInputs()
                .map((input) => {
                    const point = getBookingMapDatasetCoords(input);
                    return point ? `${point.lat},${point.lng}` : sanitizeInput(input.value || '').trim();
                })
                .filter(Boolean);

            const pickupPoint = parseBookingMapLatLngToken(pickup);
            const dropoffPoint = parseBookingMapLatLngToken(dropoff);
            if (pickupPoint && dropoffPoint) {
                const routePoints = [pickupPoint];
                stops.forEach((stopValue) => {
                    const stopPoint = parseBookingMapLatLngToken(stopValue);
                    if (stopPoint) routePoints.push(stopPoint);
                });
                routePoints.push(dropoffPoint);
                const route = routePoints.map((point) => `${point.lat},${point.lng}`).join(';');
                return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
            }

            const searchQuery = pickup || dropoff || stops[0] || '';
            if (!searchQuery) return 'https://www.openstreetmap.org';
            return `https://www.openstreetmap.org/search?query=${encodeURIComponent(searchQuery)}`;
        }

        function updateBookingGoogleMapRouteLink() {
            const linkNode = document.getElementById('routePreviewLink');
            if (!linkNode) return;
            const pickup = getBookingMapInputValue('pickup');
            const dropoff = getBookingMapInputValue('dropoff');
            if (pickup && dropoff) {
                linkNode.href = buildBookingGoogleMapsUrl();
                linkNode.style.display = 'inline-flex';
                return;
            }
            linkNode.style.display = 'none';
        }

        function normalizeBookingMapCoords(raw = {}, defaults = {}) {
            const source = raw && typeof raw === 'object' ? raw : {};
            const lat = Number(source.lat ?? source.latitude);
            const lng = Number(source.lng ?? source.lon ?? source.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
            const accuracyValue = Number(source.accuracy ?? source.accuracyMeters ?? source.horizontalAccuracy);
            const altitudeAccuracyValue = Number(source.altitudeAccuracy);
            const capturedAt = sanitizeInput(
                source.capturedAt
                    || defaults.capturedAt
                    || (source.timestamp ? new Date(source.timestamp).toISOString() : '')
                    || new Date().toISOString(),
                60
            );
            const point = {
                lat: Number(lat.toFixed(7)),
                lng: Number(lng.toFixed(7)),
                source: sanitizeInput(source.source || defaults.source || 'map_pin', 80),
                capturedAt,
                googleMapsUrl: ''
            };
            if (Number.isFinite(accuracyValue) && accuracyValue >= 0) {
                point.accuracy = Math.round(accuracyValue);
            }
            if (Number.isFinite(altitudeAccuracyValue) && altitudeAccuracyValue >= 0) {
                point.altitudeAccuracy = Math.round(altitudeAccuracyValue);
            }
            point.googleMapsUrl = buildBookingMapPointUrl(point);
            return point;
        }

        function buildBookingMapPointUrl(coords) {
            const lat = Number(coords?.lat ?? coords?.latitude);
            const lng = Number(coords?.lng ?? coords?.lon ?? coords?.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return '';
            const safeLat = Number(lat.toFixed(7));
            const safeLng = Number(lng.toFixed(7));
            return `https://www.openstreetmap.org/?mlat=${safeLat}&mlon=${safeLng}#map=17/${safeLat}/${safeLng}`;
        }

        function formatBookingMapAccuracy(coords) {
            const point = normalizeBookingMapCoords(coords);
            if (!point || !Number.isFinite(Number(point.accuracy))) return '';
            return `GPS ±${Math.max(1, Math.round(Number(point.accuracy)))}m`;
        }

        function formatBookingMapCoords(coords) {
            const point = normalizeBookingMapCoords(coords);
            if (!point) return '';
            const accuracy = formatBookingMapAccuracy(point);
            return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}${accuracy ? ` (${accuracy})` : ''}`;
        }

        function getBookingDistanceMeters(basePoint, nextPoint) {
            const base = normalizeBookingMapCoords(basePoint);
            const next = normalizeBookingMapCoords(nextPoint);
            if (!base || !next) return Number.POSITIVE_INFINITY;
            const toRadians = (value) => (value * Math.PI) / 180;
            const earthRadiusMeters = 6371000;
            const dLat = toRadians(next.lat - base.lat);
            const dLng = toRadians(next.lng - base.lng);
            const lat1 = toRadians(base.lat);
            const lat2 = toRadians(next.lat);
            const a = (Math.sin(dLat / 2) ** 2)
                + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLng / 2) ** 2));
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return earthRadiusMeters * c;
        }

        function getBookingMapDatasetCoords(input) {
            if (!input || !input.dataset) return null;
            return normalizeBookingMapCoords({
                lat: input.dataset.googleMapLat,
                lng: input.dataset.googleMapLng,
                accuracy: input.dataset.googleMapAccuracy,
                capturedAt: input.dataset.googleMapCapturedAt,
                source: input.dataset.googleMapSource
            });
        }

        function getBookingMapCoordsForTarget(target) {
            const safeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            const statePoint = normalizeBookingMapCoords(bookingGoogleMapState.coords[safeTarget]);
            if (statePoint) return statePoint;

            if (safeTarget === 'stop') {
                const stopInput = getRouteStopInputs().find((input) => getBookingMapDatasetCoords(input));
                return getBookingMapDatasetCoords(stopInput);
            }

            const inputIds = safeTarget === 'dropoff'
                ? ['dropoff', 'cabQuickDropoffInput']
                : ['pickup', 'cabQuickPickupInput'];
            for (const inputId of inputIds) {
                const point = getBookingMapDatasetCoords(document.getElementById(inputId));
                if (point) return point;
            }
            return null;
        }

        function getBookingMapQueryValue(target) {
            const point = getBookingMapCoordsForTarget(target);
            if (point) return `${point.lat},${point.lng}`;
            return getBookingMapInputValue(target);
        }

        function saveBookingExactLocationSnapshot() {
            try {
                const snapshot = buildBookingLocationSnapshot();
                localStorage.setItem(BOOKING_EXACT_LOCATION_STORAGE_KEY, JSON.stringify({
                    ...snapshot,
                    updatedAt: new Date().toISOString()
                }));
            } catch (error) {
                // Storage can be unavailable in private browsing or strict mode.
            }
        }

        function setBookingExactLocationDataset(input, coords, address = '') {
            if (!input || !input.dataset) return;
            const point = normalizeBookingMapCoords(coords);
            if (!point) return;
            input.dataset.googleMapLat = String(point.lat);
            input.dataset.googleMapLng = String(point.lng);
            input.dataset.googleMapAccuracy = Number.isFinite(Number(point.accuracy)) ? String(point.accuracy) : '';
            input.dataset.googleMapCapturedAt = point.capturedAt || '';
            input.dataset.googleMapSource = point.source || '';
            input.dataset.googleMapUrl = point.googleMapsUrl || buildBookingMapPointUrl(point);
            input.dataset.googleMapAddress = sanitizeInput(address || input.value || '', 220);
        }

        function clearBookingExactLocationDataset(input) {
            if (!input || !input.dataset) return;
            delete input.dataset.googleMapLat;
            delete input.dataset.googleMapLng;
            delete input.dataset.googleMapAccuracy;
            delete input.dataset.googleMapCapturedAt;
            delete input.dataset.googleMapSource;
            delete input.dataset.googleMapUrl;
            delete input.dataset.googleMapAddress;
        }

        function clearBookingMapCoordinatesForInput(input) {
            if (!input || !input.matches?.('#pickup, #dropoff, #cabQuickPickupInput, #cabQuickDropoffInput, [data-route-stop-input]')) return;
            const target = input.matches('[data-route-stop-input]')
                ? 'stop'
                : (input.id === 'dropoff' || input.id === 'cabQuickDropoffInput' ? 'dropoff' : 'pickup');
            const previousAddress = sanitizeInput(input.dataset?.googleMapAddress || '').trim();
            const nextValue = sanitizeInput(input.value || '').trim();
            const hasDatasetCoords = Boolean(getBookingMapDatasetCoords(input));
            const hasStateCoords = Boolean(normalizeBookingMapCoords(bookingGoogleMapState.coords[target]));
            if (!hasDatasetCoords && !hasStateCoords) return;
            if (hasDatasetCoords && previousAddress === nextValue) return;

            if (target === 'stop') {
                clearBookingExactLocationDataset(input);
                bookingGoogleMapState.coords[target] = null;
            } else {
                const inputIds = target === 'dropoff'
                    ? ['dropoff', 'cabQuickDropoffInput']
                    : ['pickup', 'cabQuickPickupInput'];
                inputIds.forEach((inputId) => clearBookingExactLocationDataset(document.getElementById(inputId)));
                bookingGoogleMapState.coords[target] = null;
                setBookingMapMarker(target, null);
            }
            updateBookingGoogleMapLine();
            saveBookingExactLocationSnapshot();
        }

        function buildBookingReverseAddress(address = {}) {
            const parts = [
                address.house_number && address.road ? `${address.house_number}, ${address.road}` : (address.road || address.neighbourhood || address.suburb),
                address.city || address.town || address.village || address.county,
                address.state,
                address.postcode,
                address.country
            ].filter(Boolean);
            return parts.join(', ');
        }

        async function fetchBookingJsonWithTimeout(url, options = {}, timeoutMs = 2200) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller?.signal || options.signal
                });
                if (!response.ok) return null;
                return await response.json();
            } catch (error) {
                return null;
            } finally {
                if (timer) window.clearTimeout(timer);
            }
        }

        function buildBigDataCloudAddress(data = {}) {
            const parts = [
                data.locality || data.principalSubdivisionCode || data.city,
                data.city || data.localityInfo?.administrative?.[3]?.name,
                data.principalSubdivision,
                data.postcode,
                data.countryName
            ].filter(Boolean);
            return [...new Set(parts)].join(', ');
        }

        function buildBookingReverseGeocodeCacheKey(coords, precision = BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION) {
            const point = normalizeBookingMapCoords(coords);
            if (!point) return '';
            return `${point.lat.toFixed(precision)},${point.lng.toFixed(precision)}`;
        }

        function isBookingBroadAdministrativeAddress(address) {
            const normalized = normalizeBookingAddressCandidate(address);
            if (!normalized) return true;
            const lower = normalized.toLowerCase();
            const broadHints = ['tehsil', 'district', 'taluka', 'state district', 'subdistrict', 'block', 'county'];
            const hasBroadHint = broadHints.some((hint) => lower.includes(hint));
            if (!hasBroadHint) return false;
            const detailPattern = /\b(\d+[a-z0-9\-\/]*|road|rd|street|st|lane|ln|gali|chowk|circle|sector|colony|nagar|market|shop|mall|gate|hospital|hotel|temple|station|airport|flat|apt|apartment|building|plot|house|society)\b/i;
            return !detailPattern.test(normalized);
        }

        function shouldAcceptBookingReverseAddress(address) {
            const normalized = normalizeBookingAddressCandidate(address);
            if (!normalized) return false;
            if (/^-?\d+\.\d{4,}\s*,\s*-?\d+\.\d{4,}/.test(normalized)) return true;
            const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
            const hasStreetLevelHint = /\b(\d+[a-z0-9\-\/]*|road|rd|street|st|lane|ln|gali|chowk|circle|sector|colony|nagar|market|shop|mall|gate|hospital|hotel|temple|station|airport|flat|apt|apartment|building|plot|house|society)\b/i.test(normalized);
            const isLikelyCityOnly = parts.length <= 4 && !hasStreetLevelHint;
            if (isLikelyCityOnly) return false;
            if (isBookingBroadAdministrativeAddress(normalized)) return false;
            return scoreBookingAddressCandidate(normalized) >= BOOKING_REVERSE_GEOCODE_MIN_ACCEPT_SCORE;
        }

        function purgeLegacyBookingReverseGeocodeCacheKeys() {
            const keys = Array.isArray(BOOKING_REVERSE_GEOCODE_LEGACY_CACHE_KEYS)
                ? BOOKING_REVERSE_GEOCODE_LEGACY_CACHE_KEYS
                : [];
            if (!keys.length) return;
            keys.forEach((key) => {
                try {
                    localStorage.removeItem(key);
                } catch (_error) {
                    // Ignore storage errors and continue.
                }
            });
        }

        function loadBookingReverseGeocodeCache() {
            if (bookingGoogleMapState.reverseGeocodeCacheLoaded) return;
            bookingGoogleMapState.reverseGeocodeCacheLoaded = true;
            purgeLegacyBookingReverseGeocodeCacheKeys();
            try {
                const raw = JSON.parse(localStorage.getItem(BOOKING_REVERSE_GEOCODE_CACHE_STORAGE_KEY) || '[]');
                if (!Array.isArray(raw)) return;
                raw.forEach((entry) => {
                    const key = sanitizeInput(entry?.key || '', 120).trim();
                    const address = sanitizeInput(entry?.address || '', 220).trim();
                    if (!key || !address || !shouldAcceptBookingReverseAddress(address)) return;
                    bookingGoogleMapState.reverseGeocodeCache.set(key, {
                        address,
                        updatedAt: sanitizeInput(entry?.updatedAt || '', 60)
                    });
                });
            } catch (error) {
                // Ignore malformed cache entries and continue with a fresh in-memory cache.
            }
        }

        function persistBookingReverseGeocodeCache() {
            try {
                const entries = Array.from(bookingGoogleMapState.reverseGeocodeCache.entries())
                    .slice(-BOOKING_REVERSE_GEOCODE_CACHE_MAX_ENTRIES)
                    .map(([key, value]) => ({
                        key,
                        address: sanitizeInput(value?.address || '', 220).trim(),
                        updatedAt: sanitizeInput(value?.updatedAt || '', 60) || new Date().toISOString()
                    }))
                    .filter((entry) => entry.key && entry.address && shouldAcceptBookingReverseAddress(entry.address));
                localStorage.setItem(BOOKING_REVERSE_GEOCODE_CACHE_STORAGE_KEY, JSON.stringify(entries));
            } catch (error) {
                // Storage can be unavailable in private browsing or strict modes.
            }
        }

        function readBookingReverseGeocodeCache(coords) {
            loadBookingReverseGeocodeCache();
            const primaryKey = buildBookingReverseGeocodeCacheKey(coords, BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION);
            const fallbackKey = buildBookingReverseGeocodeCacheKey(coords, BOOKING_REVERSE_GEOCODE_FALLBACK_PRECISION);
            const keys = [primaryKey, fallbackKey].filter(Boolean);
            let cacheTouched = false;
            for (const key of keys) {
                const cached = bookingGoogleMapState.reverseGeocodeCache.get(key);
                const address = sanitizeInput(cached?.address || '', 220).trim();
                if (!address) continue;
                if (!shouldAcceptBookingReverseAddress(address)) {
                    bookingGoogleMapState.reverseGeocodeCache.delete(key);
                    cacheTouched = true;
                    continue;
                }
                // Touch entry to keep recent lookups hot.
                bookingGoogleMapState.reverseGeocodeCache.delete(key);
                bookingGoogleMapState.reverseGeocodeCache.set(key, {
                    address,
                    updatedAt: new Date().toISOString()
                });
                persistBookingReverseGeocodeCache();
                return address;
            }
            if (cacheTouched) persistBookingReverseGeocodeCache();
            return '';
        }

        function writeBookingReverseGeocodeCache(coords, address) {
            const normalizedAddress = sanitizeInput(address || '', 220).trim();
            if (!normalizedAddress || !shouldAcceptBookingReverseAddress(normalizedAddress)) return;
            loadBookingReverseGeocodeCache();
            const primaryKey = buildBookingReverseGeocodeCacheKey(coords, BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION);
            const fallbackKey = buildBookingReverseGeocodeCacheKey(coords, BOOKING_REVERSE_GEOCODE_FALLBACK_PRECISION);
            const keys = [primaryKey, fallbackKey].filter(Boolean);
            if (!keys.length) return;
            const payload = {
                address: normalizedAddress,
                updatedAt: new Date().toISOString()
            };
            keys.forEach((key) => {
                bookingGoogleMapState.reverseGeocodeCache.delete(key);
                bookingGoogleMapState.reverseGeocodeCache.set(key, payload);
            });
            while (bookingGoogleMapState.reverseGeocodeCache.size > BOOKING_REVERSE_GEOCODE_CACHE_MAX_ENTRIES) {
                const oldestKey = bookingGoogleMapState.reverseGeocodeCache.keys().next().value;
                if (!oldestKey) break;
                bookingGoogleMapState.reverseGeocodeCache.delete(oldestKey);
            }
            persistBookingReverseGeocodeCache();
        }

        function normalizeBookingAddressCandidate(value) {
            return sanitizeInput(value || '', 220).replace(/\s+/g, ' ').trim();
        }

        function scoreBookingAddressCandidate(value) {
            const address = normalizeBookingAddressCandidate(value);
            if (!address) return Number.NEGATIVE_INFINITY;
            const lower = address.toLowerCase();
            let score = 0;

            if (/\d/.test(address)) score += 2;
            const commaCount = (address.match(/,/g) || []).length;
            score += Math.min(3, commaCount);

            if (address.length >= 20 && address.length <= 140) score += 2;
            else if (address.length > 140) score -= 2;

            const detailHints = [
                'road', 'rd', 'street', 'st', 'gali', 'nagar', 'colony', 'sector', 'lane',
                'market', 'mall', 'hospital', 'hotel', 'temple', 'chowk', 'circle', 'gate',
                'station', 'airport', 'school', 'shop'
            ];
            const hasDetailHint = detailHints.some((hint) => new RegExp(`\\b${hint}\\b`, 'i').test(address));
            if (hasDetailHint) {
                score += 4;
            } else {
                score -= 2;
            }

            const strongBroadHints = ['tehsil', 'district', 'taluka', 'block'];
            score -= strongBroadHints.reduce((count, hint) => count + (lower.includes(hint) ? 4 : 0), 0);
            if (lower.includes('state')) score -= 2;
            if (lower.includes('india')) score -= 1;

            if (lower.includes('current location')) score -= 2;
            return score;
        }

        function pickBestBookingAddressCandidate(candidates = [], coords = null) {
            const unique = [];
            const seen = new Set();
            (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
                const normalized = normalizeBookingAddressCandidate(candidate);
                if (!normalized) return;
                const key = normalizeAirportSearchText(normalized);
                if (!key || seen.has(key)) return;
                seen.add(key);
                unique.push(normalized);
            });
            if (!unique.length) return formatBookingMapCoords(coords);
            const ranked = unique.map((address) => ({
                address,
                score: scoreBookingAddressCandidate(address)
            }));
            ranked.sort((left, right) => {
                const scoreDelta = right.score - left.score;
                if (scoreDelta !== 0) return scoreDelta;
                return left.address.length - right.address.length;
            });
            const best = ranked[0] || null;
            if (!best || best.score < BOOKING_REVERSE_GEOCODE_MIN_ACCEPT_SCORE) return formatBookingMapCoords(coords);
            return best.address;
        }

        async function reverseGeocodeBookingCoordsFallback(coords) {
            const lat = Number(coords?.lat);
            const lng = Number(coords?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
            const buildOsmParams = (overrides = {}) => {
                const params = new URLSearchParams({
                    format: 'jsonv2',
                    lat: String(lat),
                    lon: String(lng),
                    zoom: '18',
                    layer: 'address',
                    addressdetails: '1',
                    'accept-language': 'en-IN,en'
                });
                Object.entries(overrides).forEach(([key, value]) => {
                    if (value === undefined || value === null || value === '') return;
                    params.set(key, String(value));
                });
                return params;
            };

            const osmRequestOptions = {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8'
                }
            };

            const cloudParams = new URLSearchParams({
                latitude: String(lat),
                longitude: String(lng),
                localityLanguage: 'en'
            });

            const osmData = await fetchBookingJsonWithTimeout(
                `https://nominatim.openstreetmap.org/reverse?${buildOsmParams().toString()}`,
                osmRequestOptions,
                1800
            );
            const osmAddress = normalizeBookingAddressCandidate(osmData?.display_name);
            const osmStructured = normalizeBookingAddressCandidate(buildBookingReverseAddress(osmData?.address || {}));
            const primaryAddress = pickBestBookingAddressCandidate([osmStructured, osmAddress], coords);
            const primaryScore = primaryAddress ? scoreBookingAddressCandidate(primaryAddress) : Number.NEGATIVE_INFINITY;
            if (primaryAddress
                && shouldAcceptBookingReverseAddress(primaryAddress)
                && primaryScore >= BOOKING_REVERSE_GEOCODE_PRIMARY_ACCEPT_SCORE) {
                return primaryAddress;
            }

            const [osmPoiData, cloudData] = await Promise.all([
                fetchBookingJsonWithTimeout(
                    `https://nominatim.openstreetmap.org/reverse?${buildOsmParams({ layer: 'poi', zoom: '18' }).toString()}`,
                    osmRequestOptions,
                    1600
                ),
                fetchBookingJsonWithTimeout(
                    `https://api.bigdatacloud.net/data/reverse-geocode-client?${cloudParams.toString()}`,
                    {
                        method: 'GET',
                        headers: { Accept: 'application/json' }
                    },
                    1600
                )
            ]);
            const osmPoiAddress = normalizeBookingAddressCandidate(osmPoiData?.display_name);
            const osmPoiStructured = normalizeBookingAddressCandidate(buildBookingReverseAddress(osmPoiData?.address || {}));
            const cloudLabel = normalizeBookingAddressCandidate(
                cloudData?.localityInfo?.informative?.[0]?.name
                    || cloudData?.localityInfo?.administrative?.[2]?.name
                    || buildBigDataCloudAddress(cloudData || {})
            );
            const bestAddress = pickBestBookingAddressCandidate(
                [osmStructured, osmAddress, osmPoiStructured, osmPoiAddress, cloudLabel],
                coords
            );
            if (!bestAddress || !shouldAcceptBookingReverseAddress(bestAddress)) {
                return formatBookingMapCoords(coords);
            }
            return bestAddress;
        }

        function reverseGeocodeBookingCoords(coords) {
            const point = normalizeBookingMapCoords(coords);
            if (!point) return Promise.resolve('');
            const pendingKey = buildBookingReverseGeocodeCacheKey(point, BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION);
            if (!pendingKey) return Promise.resolve('');

            const cachedAddress = readBookingReverseGeocodeCache(point);
            if (cachedAddress) return Promise.resolve(cachedAddress);

            const pendingRequest = bookingGoogleMapState.reverseGeocodePending.get(pendingKey);
            if (pendingRequest) return pendingRequest;

            const request = (async () => {
                const fallbackAddress = await reverseGeocodeBookingCoordsFallback(point);
                const finalAddress = pickBestBookingAddressCandidate([fallbackAddress], point);
                if (finalAddress) {
                    writeBookingReverseGeocodeCache(point, finalAddress);
                    return finalAddress;
                }
                return formatBookingMapCoords(point);
            })()
                .finally(() => {
                    bookingGoogleMapState.reverseGeocodePending.delete(pendingKey);
                });

            bookingGoogleMapState.reverseGeocodePending.set(pendingKey, request);
            return request;
        }

        function setBookingMapMarker(target, coords) {
            if (!bookingGoogleMapState.map || !window.L) return;
            const marker = bookingGoogleMapState.markers[target];
            if (!coords) {
                if (marker?.remove) marker.remove();
                bookingGoogleMapState.markers[target] = null;
                return;
            }
            const latLng = [coords.lat, coords.lng];
            const markerClass = target === 'dropoff'
                ? 'booking-osm-marker booking-osm-marker-dropoff'
                : target === 'stop'
                    ? 'booking-osm-marker booking-osm-marker-stop'
                    : 'booking-osm-marker booking-osm-marker-pickup';
            const icon = window.L.divIcon({
                className: markerClass,
                html: '<span></span>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            if (marker?.setLatLng) {
                marker.setLatLng(latLng);
                marker.setIcon(icon);
            } else {
                bookingGoogleMapState.markers[target] = window.L.marker(latLng, {
                    icon,
                    title: target === 'dropoff' ? 'Drop location' : target === 'stop' ? 'Route stop' : 'Pickup location'
                }).addTo(bookingGoogleMapState.map);
            }
        }

        function updateBookingGoogleMapLine() {
            if (!bookingGoogleMapState.map || !window.L) return;
            const points = [
                bookingGoogleMapState.coords.pickup,
                bookingGoogleMapState.coords.stop,
                bookingGoogleMapState.coords.dropoff
            ].filter(Boolean);

            if (bookingGoogleMapState.routeLine?.remove) {
                bookingGoogleMapState.routeLine.remove();
                bookingGoogleMapState.routeLine = null;
            }
            if (points.length >= 2) {
                bookingGoogleMapState.routeLine = window.L.polyline(
                    points.map((point) => [point.lat, point.lng]),
                    {
                        color: '#1088c9',
                        opacity: 0.9,
                        weight: 4
                    }
                ).addTo(bookingGoogleMapState.map);
            }
            if (points.length) {
                const latLngPoints = points.map((point) => [point.lat, point.lng]);
                const bounds = window.L.latLngBounds(latLngPoints);
                if (points.length === 1) {
                    bookingGoogleMapState.map.setView(latLngPoints[0], 14);
                } else {
                    bookingGoogleMapState.map.fitBounds(bounds, { padding: [48, 48] });
                }
            }
        }

        function updateBookingMapFieldValue(target, value, coords = null, options = {}) {
            const cleanCoords = normalizeBookingMapCoords(coords, {
                source: options.source === 'current' ? 'browser_gps_high_accuracy' : (options.source || 'map_pin')
            });
            const cleanValue = sanitizeInput(value || '').trim() || (cleanCoords ? formatBookingMapCoords(cleanCoords) : '');
            if (!cleanValue) return;

            if (target === 'stop') {
                ensureRouteStopsReady();
                const preferredStopInput = options.stopInput?.matches?.('[data-route-stop-input]') ? options.stopInput : null;
                const stopInput = preferredStopInput || getRouteStopInputs().find((input) => !String(input.value || '').trim()) || getRouteStopInputs()[0] || addRouteStop('', false);
                if (stopInput) {
                    stopInput.value = cleanValue;
                    if (cleanCoords) {
                        setBookingExactLocationDataset(stopInput, cleanCoords, cleanValue);
                    }
                }
                handleRouteStopInputChange();
            } else {
                const inputIds = target === 'dropoff'
                    ? ['dropoff', 'cabQuickDropoffInput']
                    : ['pickup', 'cabQuickPickupInput'];
                inputIds.forEach((inputId) => {
                    const input = document.getElementById(inputId);
                    if (!input) return;
                    input.value = cleanValue;
                    if (cleanCoords) {
                        setBookingExactLocationDataset(input, cleanCoords, cleanValue);
                    }
                });
                handleLocationUpdated();
                updateBookingExperience();
            }

            if (cleanCoords) {
                bookingGoogleMapState.coords[target] = cleanCoords;
                setBookingMapMarker(target, cleanCoords);
                updateBookingGoogleMapLine();
                saveBookingExactLocationSnapshot();
            }
            updateBookingGoogleMapRouteLink();
        }

        async function applyBookingMapCoordinates(target, coords, options = {}) {
            const safeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            const cleanCoords = normalizeBookingMapCoords(coords, {
                source: options.source === 'current' ? 'browser_gps_high_accuracy' : (options.source || 'map_pin')
            });
            if (!cleanCoords) {
                showBookingLocationNotice('Location coordinates were not valid. Please try again.', 'error');
                return;
            }
            setBookingMapActiveTarget(safeTarget);
            const targetLabel = safeTarget === 'dropoff' ? 'Drop' : safeTarget === 'stop' ? 'Stop' : 'Pickup';
            const accuracy = formatBookingMapAccuracy(cleanCoords);
            const isWeak = Number(cleanCoords.accuracy || 0) > BOOKING_GPS_WEAK_ACCURACY_METERS;
            const sourceLabel = options.source === 'map' ? 'map pin' : 'exact GPS';
            const actionLabel = options.background === true ? 'refined' : 'updated';
            const weakHint = isWeak
                ? ' Signal weak hai; open area me retry karein aur browser me Precise location permission ON rakhein.'
                : '';
            const shouldFastFill = options.source === 'current' && options.background !== true;
            const preferCoordinatesFirst = shouldFastFill && options.preferCoordinatesFirst !== false;
            const cachedAddress = shouldFastFill && !preferCoordinatesFirst ? readBookingReverseGeocodeCache(cleanCoords) : '';

            if (shouldFastFill) {
                updateBookingMapFieldValue(
                    safeTarget,
                    cachedAddress || formatBookingMapCoords(cleanCoords),
                    cleanCoords,
                    options
                );
                if (!cachedAddress) {
                    setBookingMapStatus(
                        `${targetLabel} GPS lock ho gaya${accuracy ? ` (${accuracy})` : ''}. Exact address load ho raha hai...`,
                        isWeak ? 'warning' : 'info'
                    );
                }
            }

            if (shouldFastFill && !cachedAddress) {
                reverseGeocodeBookingCoords(cleanCoords)
                    .then((resolvedAddress) => {
                        const address = sanitizeInput(resolvedAddress || '', 220).trim();
                        if (!address || !shouldAcceptBookingReverseAddress(address)) return;
                        const currentPoint = getBookingMapCoordsForTarget(safeTarget);
                        const stillRelevant = pointsAreNearEnoughForRefinement(cleanCoords, currentPoint);
                        if (!stillRelevant) return;
                        updateBookingMapFieldValue(safeTarget, address, cleanCoords, options);
                    })
                    .catch(() => null);
            } else {
                const address = sanitizeInput(
                    cachedAddress || await reverseGeocodeBookingCoords(cleanCoords) || '',
                    220
                ).trim();

                if (address) {
                    const currentPoint = getBookingMapCoordsForTarget(safeTarget);
                    const stillRelevant = options.background === true || pointsAreNearEnoughForRefinement(cleanCoords, currentPoint);
                    if (stillRelevant) {
                        updateBookingMapFieldValue(safeTarget, address, cleanCoords, options);
                    }
                } else if (!shouldFastFill) {
                    updateBookingMapFieldValue(safeTarget, formatBookingMapCoords(cleanCoords), cleanCoords, options);
                }
            }

            setBookingMapStatus(
                `${targetLabel} location ${actionLabel} from ${sourceLabel}${accuracy ? ` (${accuracy})` : ''}.${weakHint}`,
                isWeak ? 'warning' : 'info'
            );
        }

        function buildBookingOsmGeocodeCacheKey(value) {
            return normalizeAirportSearchText(value || '').slice(0, 180);
        }

        function readBookingOsmGeocodeCache(value) {
            const key = buildBookingOsmGeocodeCacheKey(value);
            if (!key) return null;
            const cached = bookingGoogleMapState.osmGeocodeCache.get(key) || null;
            if (!cached) return null;
            bookingGoogleMapState.osmGeocodeCache.delete(key);
            bookingGoogleMapState.osmGeocodeCache.set(key, cached);
            return cached;
        }

        function writeBookingOsmGeocodeCache(value, coords) {
            const key = buildBookingOsmGeocodeCacheKey(value);
            if (!key) return;
            const point = normalizeBookingMapCoords(coords);
            if (!point) return;
            bookingGoogleMapState.osmGeocodeCache.delete(key);
            bookingGoogleMapState.osmGeocodeCache.set(key, point);
            while (bookingGoogleMapState.osmGeocodeCache.size > BOOKING_OSM_GEOCODE_CACHE_MAX_ENTRIES) {
                const oldestKey = bookingGoogleMapState.osmGeocodeCache.keys().next().value;
                if (!oldestKey) break;
                bookingGoogleMapState.osmGeocodeCache.delete(oldestKey);
            }
        }

        function geocodeBookingMapInput(target, value) {
            if (!bookingGoogleMapState.geocoder || !value) return;
            const query = sanitizeInput(value || '', 220).trim();
            if (query.length < 3) return;

            const cachedCoords = readBookingOsmGeocodeCache(query);
            if (cachedCoords) {
                bookingGoogleMapState.coords[target] = cachedCoords;
                setBookingMapMarker(target, cachedCoords);
                updateBookingGoogleMapLine();
                return;
            }

            const pendingKey = buildBookingOsmGeocodeCacheKey(query);
            if (!pendingKey) return;
            const pendingRequest = bookingGoogleMapState.osmGeocodePending.get(pendingKey);
            if (pendingRequest) return;

            const request = queueBookingOsmGeocodeTask(async () => {
                const params = new URLSearchParams({
                    q: query,
                    format: 'jsonv2',
                    addressdetails: '1',
                    limit: '1',
                    countrycodes: 'in'
                });
                const response = await fetchBookingJsonWithTimeout(
                    `${BOOKING_OSM_GEOCODE_ENDPOINT}?${params.toString()}`,
                    {
                        method: 'GET',
                        headers: { Accept: 'application/json' }
                    },
                    2600
                );
                return Array.isArray(response) ? response[0] : null;
            })
                .then((result) => {
                    const coords = normalizeBookingMapCoords({
                        lat: result?.lat,
                        lng: result?.lon,
                        source: 'osm_geocode'
                    });
                    if (!coords) return null;
                    writeBookingOsmGeocodeCache(query, coords);
                    return coords;
                })
                .finally(() => {
                    bookingGoogleMapState.osmGeocodePending.delete(pendingKey);
                });

            bookingGoogleMapState.osmGeocodePending.set(pendingKey, request);
            request.then((coords) => {
                if (!coords) return;
                const latestValue = getBookingMapInputValue(target);
                if (normalizeAirportSearchText(latestValue) !== normalizeAirportSearchText(query)) return;
                bookingGoogleMapState.coords[target] = coords;
                setBookingMapMarker(target, coords);
                updateBookingGoogleMapLine();
            }).catch(() => null);
        }

        function syncBookingMapFromInputs() {
            updateBookingGoogleMapRouteLink();
            if (!bookingGoogleMapState.geocoder) return;
            geocodeBookingMapInput('pickup', getBookingMapInputValue('pickup'));
            geocodeBookingMapInput('dropoff', getBookingMapInputValue('dropoff'));
            geocodeBookingMapInput('stop', getBookingMapInputValue('stop'));
        }

        function queueBookingMapSync() {
            window.clearTimeout(bookingGoogleMapState.inputTimer);
            bookingGoogleMapState.inputTimer = window.setTimeout(syncBookingMapFromInputs, 450);
        }

        function setBookingCurrentButtonBusy(button, isBusy) {
            if (!button) return;
            button.classList.toggle('is-locating', Boolean(isBusy));
            button.disabled = Boolean(isBusy);
        }

        function showBookingLocationNotice(message, type = 'info') {
            if (typeof showToast === 'function') {
                showToast(message, type, 3500, type === 'error' ? 'Location' : 'Current location');
            }
        }

        function normalizeBookingGeoPosition(position) {
            const coords = position?.coords || {};
            return normalizeBookingMapCoords({
                lat: coords.latitude,
                lng: coords.longitude,
                accuracy: coords.accuracy,
                altitudeAccuracy: coords.altitudeAccuracy,
                source: 'browser_gps_high_accuracy',
                timestamp: position?.timestamp
            });
        }

        function isBetterBookingGeoPoint(candidate, currentBest) {
            if (!candidate) return false;
            if (!currentBest) return true;
            const nextAccuracy = Number.isFinite(Number(candidate.accuracy)) ? Number(candidate.accuracy) : Number.POSITIVE_INFINITY;
            const bestAccuracy = Number.isFinite(Number(currentBest.accuracy)) ? Number(currentBest.accuracy) : Number.POSITIVE_INFINITY;
            if (nextAccuracy + 3 < bestAccuracy) return true;
            const nextTime = Date.parse(candidate.capturedAt || '');
            const bestTime = Date.parse(currentBest.capturedAt || '');
            return Number.isFinite(nextTime)
                && Number.isFinite(bestTime)
                && nextTime > bestTime + 2500
                && nextAccuracy <= bestAccuracy + 10;
        }

        function getBookingCurrentPositionOnce(timeoutMs = BOOKING_GPS_FIRST_FIX_TIMEOUT_MS) {
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition((position) => {
                    const point = normalizeBookingGeoPosition(position);
                    if (point) resolve(point);
                    else reject(new Error('invalid_position'));
                }, reject, {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: timeoutMs
                });
            });
        }

        function getBookingCurrentPositionQuick(timeoutMs = BOOKING_GPS_QUICK_FIX_TIMEOUT_MS, maxAcceptedAccuracy = BOOKING_GPS_QUICK_ACCEPT_ACCURACY_METERS) {
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition((position) => {
                    const point = normalizeBookingGeoPosition(position);
                    if (!point) {
                        reject(new Error('invalid_position'));
                        return;
                    }
                    const accuracy = Number(point.accuracy ?? Number.POSITIVE_INFINITY);
                    if (Number.isFinite(Number(maxAcceptedAccuracy))
                        && (!Number.isFinite(accuracy) || accuracy > Number(maxAcceptedAccuracy))) {
                        reject(new Error('quick_accuracy_too_low'));
                        return;
                    }
                    resolve(point);
                }, reject, {
                    enableHighAccuracy: false,
                    maximumAge: BOOKING_GPS_QUICK_MAX_AGE_MS,
                    timeout: timeoutMs
                });
            });
        }

        function getBookingCurrentPositionInstant(timeoutMs = BOOKING_GPS_INSTANT_FIX_TIMEOUT_MS) {
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition((position) => {
                    const point = normalizeBookingGeoPosition(position);
                    if (!point) {
                        reject(new Error('invalid_position'));
                        return;
                    }
                    resolve(point);
                }, reject, {
                    enableHighAccuracy: false,
                    maximumAge: BOOKING_GPS_INSTANT_MAX_AGE_MS,
                    timeout: timeoutMs
                });
            });
        }

        function refineBookingCurrentPosition(initialPoint, onBetterPoint = null) {
            if (!navigator.geolocation?.watchPosition) {
                return Promise.resolve(initialPoint);
            }
            return new Promise((resolve) => {
                let bestPoint = initialPoint;
                let settled = false;
                let watchId = null;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    if (watchId !== null) {
                        try {
                            navigator.geolocation.clearWatch(watchId);
                        } catch (error) {
                            // Ignore clearWatch issues; bestPoint is already captured.
                        }
                    }
                    window.clearTimeout(timer);
                    resolve(bestPoint);
                };
                const timer = window.setTimeout(finish, BOOKING_GPS_REFINE_WINDOW_MS);
                try {
                    watchId = navigator.geolocation.watchPosition((position) => {
                        const nextPoint = normalizeBookingGeoPosition(position);
                        if (isBetterBookingGeoPoint(nextPoint, bestPoint)) {
                            bestPoint = nextPoint;
                            if (typeof onBetterPoint === 'function') onBetterPoint(bestPoint);
                        }
                        if (Number(bestPoint?.accuracy ?? Number.POSITIVE_INFINITY) <= BOOKING_GPS_TARGET_ACCURACY_METERS) {
                            finish();
                        }
                    }, () => {
                        finish();
                    }, {
                        enableHighAccuracy: true,
                        maximumAge: 0,
                        timeout: BOOKING_GPS_REFINE_WINDOW_MS
                    });
                } catch (error) {
                    finish();
                }
            });
        }

        async function getBestBookingCurrentLocation() {
            let quickPoint = null;
            try {
                quickPoint = await getBookingCurrentPositionQuick();
                if (Number(quickPoint?.accuracy ?? Number.POSITIVE_INFINITY) <= BOOKING_GPS_TARGET_ACCURACY_METERS) {
                    return quickPoint;
                }
            } catch (_error) {
                quickPoint = null;
            }
            const precisePoint = await getBookingCurrentPositionOnce();
            if (!quickPoint) return precisePoint;
            return isBetterBookingGeoPoint(precisePoint, quickPoint) ? precisePoint : quickPoint;
        }

        function pointsAreNearEnoughForRefinement(basePoint, nextPoint) {
            return getBookingDistanceMeters(basePoint, nextPoint) <= BOOKING_GPS_REFINE_MAX_DRIFT_METERS;
        }

        function isBookingWarmCurrentLocationUsable(point) {
            const normalized = normalizeBookingMapCoords(point);
            if (!normalized) return false;
            const accuracy = Number(normalized.accuracy ?? Number.POSITIVE_INFINITY);
            if (!Number.isFinite(accuracy) || accuracy > BOOKING_GPS_TARGET_ACCURACY_METERS) return false;
            const capturedAt = Date.parse(normalized.capturedAt || '');
            if (!Number.isFinite(capturedAt)) return false;
            return (Date.now() - capturedAt) <= BOOKING_GPS_WARM_CACHE_MAX_AGE_MS;
        }

        async function warmBookingCurrentLocationCache() {
            if (!navigator.geolocation?.getCurrentPosition) return;
            if (bookingGoogleMapState.warmCurrentLocationPromise) return;
            bookingGoogleMapState.warmCurrentLocationPromise = (async () => {
                try {
                    if (navigator.permissions?.query) {
                        const permission = await navigator.permissions.query({ name: 'geolocation' });
                        const state = sanitizeInput(permission?.state || '', 20).toLowerCase();
                        if (state !== 'granted') return;
                    }
                } catch (_error) {
                    // Some browsers block permissions query; continue with non-blocking warm-up attempt.
                }
                try {
                    let bestPoint = null;
                    try {
                        bestPoint = await getBookingCurrentPositionQuick(1800);
                    } catch (_quickError) {
                        bestPoint = null;
                    }
                    const precisePoint = await getBookingCurrentPositionOnce().catch(() => null);
                    if (isBetterBookingGeoPoint(precisePoint, bestPoint)) {
                        bestPoint = precisePoint;
                    }
                    if (!bestPoint) return;
                    bookingGoogleMapState.warmCurrentLocation = bestPoint;
                    await reverseGeocodeBookingCoords(bestPoint).catch(() => '');
                } catch (_error) {
                    // Warm-up is best effort only.
                }
            })().finally(() => {
                bookingGoogleMapState.warmCurrentLocationPromise = null;
            });
        }

        function canApplyBookingBackgroundRefinement(target, basePoint) {
            const currentPoint = getBookingMapCoordsForTarget(target);
            if (!currentPoint) return true;
            if (pointsAreNearEnoughForRefinement(basePoint, currentPoint)) return true;
            return isBetterBookingGeoPoint(basePoint, currentPoint);
        }

        function startBookingCurrentLocationRefinement(target, initialPoint, options = {}) {
            if (!navigator.geolocation?.watchPosition) return;
            if (Number(initialPoint?.accuracy ?? Number.POSITIVE_INFINITY) <= BOOKING_GPS_TARGET_ACCURACY_METERS) return;

            const safeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            let lastAppliedPoint = initialPoint;
            refineBookingCurrentPosition(initialPoint, (betterPoint) => {
                if (!isBetterBookingGeoPoint(betterPoint, lastAppliedPoint)) return;
                if (!canApplyBookingBackgroundRefinement(safeTarget, betterPoint)) return;
                lastAppliedPoint = betterPoint;
                applyBookingMapCoordinates(safeTarget, betterPoint, {
                    source: 'current',
                    preferCoordinatesFirst: true,
                    stopInput: options.stopInput || null,
                    background: true
                }).catch(() => null);
            }).then((bestPoint) => {
                if (!isBetterBookingGeoPoint(bestPoint, lastAppliedPoint)) return;
                if (!canApplyBookingBackgroundRefinement(safeTarget, bestPoint)) return;
                applyBookingMapCoordinates(safeTarget, bestPoint, {
                    source: 'current',
                    preferCoordinatesFirst: true,
                    stopInput: options.stopInput || null,
                    background: true
                }).catch(() => null);
            });
        }

        async function requestBookingCurrentLocation(target = 'pickup', options = {}) {
            const safeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            const sourceButton = options.sourceButton || null;
            let busyReleased = false;
            const releaseBusy = () => {
                if (busyReleased) return;
                busyReleased = true;
                setBookingCurrentButtonBusy(sourceButton, false);
            };
            setBookingMapActiveTarget(safeTarget);
            if (!navigator.geolocation) {
                showBookingLocationNotice('Current location is not supported in this browser. Type the address manually.', 'error');
                return;
            }
            setBookingCurrentButtonBusy(sourceButton, true);
            setBookingMapStatus('Getting GPS location...', 'info');
            const warmedPoint = isBookingWarmCurrentLocationUsable(bookingGoogleMapState.warmCurrentLocation)
                ? normalizeBookingMapCoords(bookingGoogleMapState.warmCurrentLocation)
                : null;
            if (warmedPoint) {
                updateBookingMapFieldValue(
                    safeTarget,
                    formatBookingMapCoords(warmedPoint),
                    warmedPoint,
                    {
                        source: 'current',
                        preferCoordinatesFirst: true,
                        stopInput: options.stopInput || null
                    }
                );
                releaseBusy();
                const warmAccuracy = formatBookingMapAccuracy(warmedPoint);
                setBookingMapStatus(
                    `Using recent GPS lock${warmAccuracy ? ` (${warmAccuracy})` : ''}. Fresh precise point verify ho raha hai...`,
                    'info'
                );
            }
            try {
                const mapReadyPromise = ensureBookingGoogleMapReady().catch(() => false);
                let lastAppliedPoint = warmedPoint;

                if (!warmedPoint) {
                    const instantPoint = await getBookingCurrentPositionInstant().catch(() => null);
                    if (instantPoint) {
                        await applyBookingMapCoordinates(safeTarget, instantPoint, {
                            source: 'current',
                            preferCoordinatesFirst: true,
                            stopInput: options.stopInput || null
                        });
                        lastAppliedPoint = instantPoint;
                        releaseBusy();
                    }
                }

                const coords = await getBestBookingCurrentLocation();
                const shouldReplaceWarmPoint = !lastAppliedPoint
                    || isBetterBookingGeoPoint(coords, lastAppliedPoint)
                    || getBookingDistanceMeters(coords, lastAppliedPoint) > 20;
                if (shouldReplaceWarmPoint) {
                    await applyBookingMapCoordinates(safeTarget, coords, {
                        source: 'current',
                        preferCoordinatesFirst: true,
                        stopInput: options.stopInput || null
                    });
                    lastAppliedPoint = coords;
                    releaseBusy();
                }
                bookingGoogleMapState.warmCurrentLocation = coords;
                reverseGeocodeBookingCoords(coords).catch(() => '');
                mapReadyPromise.then(() => {
                    const latestPoint = getBookingMapCoordsForTarget(safeTarget)
                        || normalizeBookingMapCoords(lastAppliedPoint || coords);
                    if (!latestPoint) return;
                    bookingGoogleMapState.coords[safeTarget] = latestPoint;
                    setBookingMapMarker(safeTarget, latestPoint);
                    updateBookingGoogleMapLine();
                });
                startBookingCurrentLocationRefinement(safeTarget, coords, {
                    stopInput: options.stopInput || null
                });
            } catch (error) {
                releaseBusy();
                showBookingLocationNotice('Please allow location permission, then tap the location arrow again.', 'error');
                setBookingMapStatus('Location permission needed. Please allow precise location and try again.', 'error');
                return;
            }
            releaseBusy();
        }

        function initGoogleMapBookingUI() {
            if (!document.querySelector('[data-map-current-target]')) return;
            if (document.body.dataset.bookingGoogleMapDelegated !== '1') {
                document.addEventListener('click', (event) => {
                    const currentButton = event.target.closest('[data-map-current-target]');
                    if (currentButton) {
                        event.preventDefault();
                        event.stopPropagation();
                        const stopInput = currentButton.closest('[data-route-stop-row]')?.querySelector('[data-route-stop-input]') || null;
                        requestBookingCurrentLocation(currentButton.dataset.mapCurrentTarget || 'pickup', {
                            sourceButton: currentButton,
                            stopInput
                        });
                        return;
                    }
                    const targetButton = event.target.closest('[data-map-target]');
                    if (targetButton) {
                        event.preventDefault();
                        setBookingMapActiveTarget(targetButton.dataset.mapTarget || 'pickup');
                    }
                });
                document.addEventListener('input', (event) => {
                    if (event.target.matches('#pickup, #dropoff, #cabQuickPickupInput, #cabQuickDropoffInput, [data-route-stop-input]')) {
                        clearBookingMapCoordinatesForInput(event.target);
                        queueBookingMapSync();
                    }
                });
                document.addEventListener('change', (event) => {
                    if (event.target.matches('#pickup, #dropoff, #cabQuickPickupInput, #cabQuickDropoffInput, [data-route-stop-input]')) {
                        clearBookingMapCoordinatesForInput(event.target);
                        queueBookingMapSync();
                    }
                });
                document.body.dataset.bookingGoogleMapDelegated = '1';
            }
            window.GoIndiaRideBookingMap = {
                init: initGoogleMapBookingUI,
                getLocationPins: buildBookingLocationSnapshot,
                refresh: syncBookingMapFromInputs,
                requestCurrentLocation: requestBookingCurrentLocation,
                setTarget: setBookingMapActiveTarget
            };
            setBookingMapActiveTarget(bookingGoogleMapState.activeTarget);
            ensureBookingGoogleMapReady();
            updateBookingGoogleMapRouteLink();
            warmBookingCurrentLocationCache();
        }

        function resolveBookingLocationInputValue(input, options = {}) {
            if (!input) return true;

            if (getActiveCabFlow() === 'airport' && getAirportFieldRole(input.id) === 'airport') {
                return resolveAirportInputValue(input, options);
            }

            const rawValue = sanitizeInput(input.value || '').trim();
            if (rawValue.length < 2) return rawValue.length >= 3;

            const exactPoint = getBookingMapDatasetCoords(input);
            if (exactPoint) {
                const exactAddress = sanitizeInput(input.dataset?.googleMapAddress || '', 220).trim();
                if (exactAddress && normalizeAirportSearchText(exactAddress) !== normalizeAirportSearchText(rawValue)) {
                    input.value = exactAddress;
                    syncAirportPairedInput(input.id, exactAddress);
                    updateBookingExperience();
                }
                return true;
            }

            const visibleSuggestion = options.useVisibleSuggestion === false
                ? ''
                : getAutocompleteDisplayTextFromBox(input);
            const resolvedValue = visibleSuggestion || getResolvableGenericLocation(rawValue);
            if (!resolvedValue || normalizeAirportSearchText(resolvedValue) === normalizeAirportSearchText(rawValue)) {
                return true;
            }

            input.value = resolvedValue;
            syncAirportPairedInput(input.id, resolvedValue);
            closeAllBookingAutocompleteBoxes();
            updateBookingExperience();
            return true;
        }

        function showQuickLocationSuggestions(input, event) {
            if (!input || !input.closest('#cabBookingConsole')) return false;
            if (input.id !== 'cabQuickPickupInput' && input.id !== 'cabQuickDropoffInput') return false;
            if (event?.isComposing) return false;

            if (input.__cabAutoResolveTimer) {
                window.clearTimeout(input.__cabAutoResolveTimer);
                input.__cabAutoResolveTimer = null;
            }
            delete input.dataset.cabAutoResolvedSource;
            delete input.dataset.cabAutoResolvedValue;

            const sourceValue = String(input.value || '');
            const inputType = String(event?.inputType || '').toLowerCase();
            if (inputType.startsWith('delete') && sourceValue.trim().length < 2) {
                closeAllBookingAutocompleteBoxes();
                return true;
            }

            window.setTimeout(() => {
                if (String(input.value || '') !== sourceValue) return;
                if (getActiveCabFlow() === 'airport' && getAirportFieldRole(input.id) === 'airport') {
                    showAirportAutocomplete(input);
                } else {
                    const suggestionsBox = getBookingAutocompleteBox(input);
                    if (suggestionsBox?.style.display === 'block' && suggestionsBox.querySelector('.autocomplete-item')) {
                        positionBookingAutocompleteBox(input, suggestionsBox);
                        return;
                    }
                    showQuickGenericAutocomplete(input);
                }
            }, 0);
            return true;
        }

        function resolveCabQuickLocationValues(options = {}) {
            ['cabQuickPickupInput', 'cabQuickDropoffInput'].forEach((inputId) => {
                const input = document.getElementById(inputId);
                if (input && String(input.value || '').trim()) {
                    resolveBookingLocationInputValue(input, options);
                }
            });
        }

        function commitAndCloseBookingAutocompleteBoxes() {
            resolveCabQuickLocationValues({
                showSuggestions: false,
                useVisibleSuggestion: true
            });
            closeAllBookingAutocompleteBoxes();
        }

        function highlightAirportSuggestionText(text, query) {
            const safeText = escapeBookingHtml(text);
            const normalizedQuery = String(query || '').trim();
            if (!normalizedQuery) return safeText;
            const regex = new RegExp(`(${escapeBookingRegex(normalizedQuery)})`, 'ig');
            return safeText.replace(regex, '<strong>$1</strong>');
        }

        function selectAirportSuggestion(input, airport) {
            const value = formatAirportSuggestion(airport);
            if (!input || !value) return;

            input.value = value;
            input.dataset.cabCommittedSelection = '1';
            delete input.dataset.cabAutoResolvedSource;
            delete input.dataset.cabAutoResolvedValue;
            syncAirportPairedInput(input.id, value);
            closeAirportAutocompleteBoxes();
            input.dispatchEvent(new Event('change', { bubbles: true }));
            updateBookingExperience();
        }

        function getVisibleAirportSuggestion(input) {
            if (!input || !input.id) return null;
            const box = document.getElementById(`${input.id}Autocomplete`);
            const firstItem = box?.querySelector?.('.airport-autocomplete-item');
            const display = sanitizeInput(firstItem?.dataset?.airportDisplay || '').trim();
            if (!display) return null;
            return findExactAirportMatch(display);
        }

        function resolveAirportInputValue(input, options = {}) {
            if (!input || getActiveCabFlow() !== 'airport' || getAirportFieldRole(input.id) !== 'airport') {
                return true;
            }

            const rawValue = String(input.value || '').trim();
            if (!rawValue) return false;

            const contextText = getAirportContextTextForInput(input);
            const visibleAirport = options.useVisibleSuggestion !== false && (contextText || !isBroadAirportQuery(rawValue))
                ? getVisibleAirportSuggestion(input)
                : null;
            const airport = visibleAirport || getResolvableAirport(rawValue, { contextText });
            if (airport) {
                const formatted = formatAirportSuggestion(airport);
                if (formatted && input.value !== formatted) {
                    input.value = formatted;
                    syncAirportPairedInput(input.id, formatted);
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
                closeAirportAutocompleteBoxes();
                updateBookingExperience();
                return true;
            }

            if (options.showSuggestions !== false) {
                showAirportAutocomplete(input);
            }
            return false;
        }

        function showAirportAutocomplete(input, queryOverride = '') {
            if (!input || getActiveCabFlow() !== 'airport' || getAirportFieldRole(input.id) !== 'airport') return false;

            const suggestionsBox = getBookingAutocompleteBox(input);
            if (!suggestionsBox) return false;
            suggestionsBox.dataset.airportScoped = '1';
            suggestionsBox.innerHTML = '';

            const query = String(queryOverride || input.value || '').trim();
            if (query.length < 2) {
                suggestionsBox.style.display = 'none';
                return true;
            }

            const matches = searchIndianAirports(query, {
                contextText: getAirportContextTextForInput(input)
            });
            suggestionsBox.style.display = 'block';
            positionBookingAutocompleteBox(input, suggestionsBox);

            const header = document.createElement('div');
            header.className = 'autocomplete-category airport-autocomplete-category';
            header.textContent = 'Indian Airports';
            suggestionsBox.appendChild(header);

            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'autocomplete-no-results';
                empty.textContent = 'No Indian airport found';
                suggestionsBox.appendChild(empty);
                return true;
            }

            matches.forEach((airport, index) => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item airport-autocomplete-item';
                item.dataset.index = String(index);
                item.dataset.airportDisplay = formatAirportSuggestion(airport);
                item.innerHTML = `
                    <span>${highlightAirportSuggestionText(formatAirportSuggestion(airport), query)}</span>
                    <small>${escapeBookingHtml([airport.code, airport.city, airport.state].filter(Boolean).join(' - '))}</small>
                `;
                let selectionHandled = false;
                const selectAirport = (event) => {
                    if (event) event.preventDefault();
                    if (selectionHandled) return;
                    selectionHandled = true;
                    selectAirportSuggestion(input, airport);
                };
                item.addEventListener('pointerdown', selectAirport);
                item.addEventListener('click', selectAirport);
                suggestionsBox.appendChild(item);
            });

            positionBookingAutocompleteBox(input, suggestionsBox);
            return true;
        }

        function bindAirportOnlyAutocomplete(inputId) {
            const input = document.getElementById(inputId);
            if (!input || input.dataset.airportOnlyAutocompleteBound === '1') return;

            input.addEventListener('input', () => {
                if (getActiveCabFlow() === 'airport') {
                    showAirportAutocomplete(input);
                }
            });
            input.addEventListener('focus', () => {
                if (getActiveCabFlow() === 'airport') {
                    showAirportAutocomplete(input);
                }
            });
            input.addEventListener('keydown', (event) => {
                if (getActiveCabFlow() === 'airport' && event.key === 'Escape') {
                    closeAirportAutocompleteBoxes();
                }
            });
            window.addEventListener('resize', () => {
                if (getActiveCabFlow() === 'airport' && document.activeElement === input) {
                    showAirportAutocomplete(input);
                }
            });
            document.addEventListener('scroll', (event) => {
                if (isBookingAutocompleteInternalScroll(event)) return;
                if (getActiveCabFlow() === 'airport' && document.activeElement === input) {
                    const box = document.getElementById(`${input.id}Autocomplete`);
                    if (box?.style.display === 'block') {
                        positionBookingAutocompleteBox(input, box);
                    }
                }
            }, true);

            input.dataset.airportOnlyAutocompleteBound = '1';
        }

        function syncAirportOnlyFieldUi(flow = getActiveCabFlow()) {
            const isAirportFlow = flow === 'airport';
            if (isAirportFlow) closeAirportAutocompleteBoxes();
            const airportConfig = getAirportServiceConfig();
            const terminalRequirement = getAirportTerminalRequirementState();
            const terminalOptionalHint = isAirportFlow && terminalRequirement.hasAirportSelection && !terminalRequirement.required
                ? ' (optional)'
                : '';
            const placeholderMap = {
                cabQuickPickupInput: isAirportFlow ? airportConfig.pickupPlaceholder : 'Pickup city / airport',
                cabQuickDropoffInput: isAirportFlow ? airportConfig.dropPlaceholder : 'Drop city / airport',
                cabQuickTerminalInput: isAirportFlow && terminalRequirement.hasAirportSelection && !terminalRequirement.required
                    ? 'Optional for single-terminal airports'
                    : (isAirportFlow ? airportConfig.terminalPlaceholder : 'Terminal, gate, pillar or pickup point'),
                pickup: isAirportFlow ? airportConfig.pickupPlaceholder : 'Where are you? (Enter address or landmark)',
                dropoff: isAirportFlow ? airportConfig.dropPlaceholder : 'Where to? (Enter address or landmark)'
            };

            Object.keys(placeholderMap).forEach((inputId) => {
                const input = document.getElementById(inputId);
                if (input) input.placeholder = placeholderMap[inputId];
            });

            const quickPickupLabel = document.getElementById('cabQuickPickupInput')?.closest('.cab-mini-field')?.querySelector('span');
            const quickDropoffLabel = document.getElementById('cabQuickDropoffInput')?.closest('.cab-mini-field')?.querySelector('span');
            const quickTerminalLabel = document.getElementById('cabQuickTerminalInput')?.closest('.cab-mini-field')?.querySelector('span');
            if (quickPickupLabel) quickPickupLabel.textContent = isAirportFlow ? airportConfig.pickupLabel : 'From';
            if (quickDropoffLabel) quickDropoffLabel.textContent = isAirportFlow ? airportConfig.dropLabel : 'To';
            if (quickTerminalLabel) quickTerminalLabel.textContent = isAirportFlow ? `${airportConfig.terminalLabel}${terminalOptionalHint}` : 'Terminal / Gate';
            const terminalInput = document.getElementById('cabQuickTerminalInput');
            if (terminalInput) {
                const terminalIsRequired = isAirportFlow && terminalRequirement.required;
                terminalInput.required = false;
                terminalInput.dataset.cabTerminalRequired = terminalIsRequired ? '1' : '0';
                terminalInput.setAttribute('aria-required', terminalIsRequired ? 'true' : 'false');
            }

            const pickupLabel = document.querySelector('label[for="pickup"]');
            const dropLabel = document.querySelector('label[for="dropoff"]');
            if (pickupLabel) pickupLabel.textContent = isAirportFlow ? `${airportConfig.pickupLabel} *` : 'Pickup Location *';
            if (dropLabel) dropLabel.textContent = isAirportFlow ? `${airportConfig.dropLabel} *` : 'Dropoff Location *';

            const airportScopeNote = document.getElementById('cabAirportScopeNote');
            if (airportScopeNote && isAirportFlow) {
                const chipIcons = ['fa-plane-arrival', 'fa-clock', 'fa-id-card', 'fa-suitcase-rolling'];
                airportScopeNote.innerHTML = (airportConfig.chips || ['Airport transfer', 'Flight ready', 'Driver details', 'Luggage fit'])
                    .slice(0, 4)
                    .map((chip, index) => `<span><i class="fas ${chipIcons[index] || 'fa-circle-check'}"></i> ${escapeBookingHtml(chip)}</span>`)
                    .join('');
            }

            const notesNode = document.getElementById('notes');
            if (notesNode) {
                notesNode.placeholder = isAirportFlow
                    ? `${airportConfig.label}: flight number, terminal, gate, pickup signboard, waiting or delay note`
                    : 'E.g., Driver will wait for 5 mins, etc.';
            }

            if (!isAirportFlow) closeAirportAutocompleteBoxes();
        }

        function resolveScopedSelectLabel(selectId, option, flow = getActiveCabFlow()) {
            if (!option) return '';
            if (!option.dataset.baseLabel) {
                option.dataset.baseLabel = String(option.textContent || '').trim();
            }

            const baseLabel = option.dataset.baseLabel || '';
            const value = String(option.value || '');
            if (selectId !== 'tripServiceType') return baseLabel;

            if (flow === 'outstation' && value === 'round_trip_service') return 'Outstation Intercity';
            if (flow === 'day_trips' && value === 'city_local_trip') return 'Day Plan Service';
            if (flow === 'airport' && value === 'airport_transfer') return 'Airport Transfer';
            if (flow === 'airport' && value === 'railway_station_transfer') return 'Railway Station Transfer';
            return baseLabel;
        }

        function applyScopedSelectVisibility(selectNode, allowedValues = [], preferredValue = '', flow = getActiveCabFlow()) {
            if (!selectNode) return;
            const allowList = Array.isArray(allowedValues) ? allowedValues.filter(Boolean).map((value) => String(value)) : [];
            const options = Array.from(selectNode.options);
            if (!options.length) return;

            const safeAllowList = allowList.length ? allowList : [String(preferredValue || options[0].value || '')];
            const allowSet = new Set(safeAllowList);

            options.forEach((option) => {
                option.textContent = resolveScopedSelectLabel(selectNode.id, option, flow);
                const visible = allowSet.has(String(option.value));
                option.hidden = !visible;
                option.disabled = !visible;
            });

            const fallbackValue = safeAllowList.find((value) => options.some((option) => String(option.value) === String(value))) || String(options[0].value || '');
            if (!allowSet.has(String(selectNode.value || ''))) {
                selectNode.value = fallbackValue;
            }

            const isSingle = allowSet.size <= 1;
            selectNode.disabled = isSingle;
            selectNode.classList.toggle('is-flow-scoped-single', isSingle);
            return {
                isSingle,
                visibleCount: allowSet.size
            };
        }

        function syncInlineFieldRow(selectNode, visibleCount) {
            if (!selectNode) return;
            const formGroup = selectNode.closest('.form-group');
            const row = formGroup?.parentElement;
            if (!formGroup || !row) return;

            const shouldHide = formGroup.classList.contains('booking-internal-field') || Number(visibleCount || 0) <= 1;
            formGroup.style.display = shouldHide ? 'none' : '';
            formGroup.hidden = shouldHide;
            formGroup.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');

            const siblingGroups = Array.from(row.children).filter((node) => node.classList && node.classList.contains('form-group'));
            const visibleGroups = siblingGroups.filter((node) => node.style.display !== 'none' && !node.hidden);
            row.style.gridTemplateColumns = visibleGroups.length <= 1 ? '1fr' : '';
        }

        function syncCabScopedSelectOptions(flow = getActiveCabFlow()) {
            const activeFlow = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
            const config = getCabFlowConfig(activeFlow);
            const tripPlanNode = document.getElementById('tripPlan');
            const serviceTypeNode = document.getElementById('tripServiceType');

            const tripPlanScopedState = applyScopedSelectVisibility(
                tripPlanNode,
                CAB_FLOW_TRIP_PLAN_OPTIONS[activeFlow] || CAB_FLOW_TRIP_PLAN_OPTIONS.airport,
                config.tripPlan,
                activeFlow
            );
            const serviceTypeScopedState = applyScopedSelectVisibility(
                serviceTypeNode,
                CAB_FLOW_SERVICE_TYPE_OPTIONS[activeFlow] || CAB_FLOW_SERVICE_TYPE_OPTIONS.airport,
                config.serviceType,
                activeFlow
            );
            syncInlineFieldRow(tripPlanNode, tripPlanScopedState?.visibleCount || 0);
            syncInlineFieldRow(serviceTypeNode, serviceTypeScopedState?.visibleCount || 0);
        }

        function mountAdvancedDrawerInline() {
            const drawer = document.getElementById('advancedBookingDrawer');
            const main = document.querySelector('#cabBookingConsole .cab-console-main');
            const actions = main?.querySelector(':scope > .cab-console-actions');
            if (!drawer || !main || drawer.dataset.inlineMounted === '1') return;

            drawer.classList.add('is-inline-flow');
            if (actions && actions.parentNode === main) {
                actions.insertAdjacentElement('afterend', drawer);
            } else {
                main.appendChild(drawer);
            }
            drawer.dataset.inlineMounted = '1';
        }

        function syncCabStageLayout() {
            const main = document.querySelector('#cabBookingConsole .cab-console-main');
            const drawer = document.getElementById('advancedBookingDrawer');
            const actions = main?.querySelector(':scope > .cab-console-actions');
            const quickForm = main?.querySelector(':scope > .cab-mini-form');
            const routeAddons = main?.querySelector(':scope > .cab-route-addons');
            if (!main || !drawer || !actions || !quickForm) return;

            const advancedReady = Boolean(document.body?.classList.contains('booking-advanced-ready'));
            if (advancedReady) {
                if (actions.previousElementSibling !== drawer) {
                    drawer.insertAdjacentElement('afterend', actions);
                }
            } else {
                const quickFlowAnchor = routeAddons || quickForm;
                if (actions.previousElementSibling !== quickFlowAnchor) {
                    quickFlowAnchor.insertAdjacentElement('afterend', actions);
                }
            }
        }

        function handleCabStepBack() {
            const activeFlow = getActiveCabFlow();
            const advancedReady = Boolean(document.body?.classList.contains('booking-advanced-ready'));

            if (advancedReady) {
                const sections = getServiceVisibleSections(activeFlow);
                if (!sections.length) return false;
                const currentIndex = getServiceFolderProgressIndex(activeFlow, sections);
                if (currentIndex > 0) {
                    setServiceFolderProgressIndex(activeFlow, currentIndex - 1, sections);
                    openNextAdvancedBookingStep();
                    return true;
                }

                if (document.body) {
                    document.body.classList.remove('booking-advanced-ready');
                }
                const layers = buildCabQuickLayers(activeFlow);
                if (layers.length) {
                    cabLayerManualIndex = layers.length - 1;
                    cabLayerUnlockedIndex = layers.length - 1;
                }
                syncCabLayerFlow(activeFlow);
                syncCabStageLayout();
                return true;
            }

            const layers = buildCabQuickLayers(activeFlow);
            if (!layers.length) return false;
            if (cabLayerFlowSnapshot !== activeFlow) {
                resetCabLayerProgress(activeFlow);
            }

            const currentIndex = Number.isInteger(cabLayerManualIndex) ? cabLayerManualIndex : cabLayerUnlockedIndex;
            if (currentIndex <= 0) return false;
            cabLayerManualIndex = currentIndex - 1;
            cabLayerUnlockedIndex = Math.max(cabLayerUnlockedIndex, currentIndex);
            syncCabLayerFlow(activeFlow);
            const previousLayer = layers[cabLayerManualIndex];
            focusCabLayerInput(previousLayer && previousLayer.node, true);
            return true;
        }

        function readSelectedOptionText(selectId, fallback = '') {
            const node = document.getElementById(selectId);
            if (!node) return fallback;
            return node.options[node.selectedIndex]?.text || fallback;
        }

        function setQuickControlValue(id, value) {
            const node = document.getElementById(id);
            if (!node || document.activeElement === node) return;
            node.value = value || '';
        }

        function resolveCabPackageValue(flow = getActiveCabFlow()) {
            const journeyMode = document.querySelector('input[name="journeyMode"]:checked')?.value || 'one_way';
            if (flow === 'day_trips') {
                const currentPackage = document.getElementById('cabQuickPackageSelect')?.value || '';
                return CAB_DAY_PLAN_PACKAGE_VALUES.includes(currentPackage)
                    ? currentPackage
                    : (CAB_DAY_PLAN_PACKAGE_OPTIONS[0]?.value || '');
            }
            if (flow === 'outstation') return journeyMode === 'round_trip' ? 'outstation_round' : 'outstation_one_way';
            if (flow === 'airport' && isAirportPackageMode()) {
                const currentPackage = document.getElementById('cabQuickPackageSelect')?.value || '';
                const airportPackageOptions = getAirportPackageOptions();
                const airportPackageValues = airportPackageOptions.map((option) => option.value);
                return airportPackageValues.includes(currentPackage)
                    ? currentPackage
                    : (getAirportServiceConfig().defaultPackage || airportPackageOptions[0]?.value || 'airport');
            }
            return 'airport';
        }

        function applyCabPackageValue(value, options = {}) {
            const packageValue = String(value || 'airport');
            if (getActiveCabFlow() === 'airport' && packageValue.startsWith('airport_')) {
                syncPackageSelectOptions('airport');
                syncCabLayerFlow('airport');
                if (options.skipFare !== true) updateFare();
                else updateBookingExperience();
                return;
            }
            if (CAB_DAY_PLAN_PACKAGE_VALUES.includes(packageValue)) {
                if (getActiveCabFlow() !== 'day_trips') {
                    setCabBookingMode('day_trips', { skipFare: true });
                } else {
                    syncCabScopedSelectOptions('day_trips');
                    syncCabLayerFlow('day_trips');
                }
            } else if (packageValue === 'outstation_round') {
                setCabBookingMode('outstation', { skipFare: true });
                setCabJourneyMode('round_trip', { skipFare: true });
            } else if (packageValue === 'outstation_one_way') {
                setCabBookingMode('outstation', { skipFare: true });
                setCabJourneyMode('one_way', { skipFare: true });
            } else {
                setCabBookingMode('airport', { skipFare: true });
            }

            if (options.skipFare !== true) {
                updateFare();
            } else {
                updateBookingExperience();
            }
        }

        const BOOKING_MIN_LEAD_MINUTES = 60;

        function padBookingDatePart(value) {
            return String(value).padStart(2, '0');
        }

        function formatLocalDateInputValue(dateValue) {
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
            return [
                date.getFullYear(),
                padBookingDatePart(date.getMonth() + 1),
                padBookingDatePart(date.getDate())
            ].join('-');
        }

        function formatLocalTimeInputValue(dateValue) {
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
            return [
                padBookingDatePart(date.getHours()),
                padBookingDatePart(date.getMinutes())
            ].join(':');
        }

        function getDefaultBookingStartDateTime() {
            const date = new Date(Date.now() + BOOKING_MIN_LEAD_MINUTES * 60 * 1000);
            const roundedMinutes = Math.ceil(date.getMinutes() / 5) * 5;
            if (roundedMinutes >= 60) {
                date.setHours(date.getHours() + 1, 0, 0, 0);
            } else {
                date.setMinutes(roundedMinutes, 0, 0);
            }
            return date;
        }

        function syncBookingDateTimeLimits() {
            const minimumStart = getDefaultBookingStartDateTime();
            const minimumDate = formatLocalDateInputValue(minimumStart);
            const minimumTime = formatLocalTimeInputValue(minimumStart);
            const rideDateNode = document.getElementById('rideDate');
            const rideTimeNode = document.getElementById('rideTime');
            const quickDateNode = document.getElementById('cabQuickDateInput');
            const quickTimeNode = document.getElementById('cabQuickTimeInput');
            const returnDateNode = document.getElementById('returnDate');
            const returnTimeNode = document.getElementById('returnTime');
            const quickReturnDateNode = document.getElementById('cabQuickReturnDateInput');
            const quickReturnTimeNode = document.getElementById('cabQuickReturnTimeInput');

            [rideDateNode, quickDateNode].forEach((node) => {
                if (node) node.min = minimumDate;
            });

            if (rideDateNode && rideDateNode.value && rideDateNode.value < minimumDate) {
                rideDateNode.value = minimumDate;
            }
            if (quickDateNode && quickDateNode.value && quickDateNode.value < minimumDate) {
                quickDateNode.value = minimumDate;
            }

            const selectedRideDate = rideDateNode?.value || quickDateNode?.value || minimumDate;
            const selectedMinimumTime = selectedRideDate === minimumDate ? minimumTime : '';
            [rideTimeNode, quickTimeNode].forEach((node) => {
                if (!node) return;
                node.min = selectedMinimumTime;
                if (selectedMinimumTime && node.value && node.value < selectedMinimumTime) {
                    node.value = selectedMinimumTime;
                }
            });

            const returnMinimumDate = selectedRideDate || minimumDate;
            [returnDateNode, quickReturnDateNode].forEach((node) => {
                if (!node) return;
                node.min = returnMinimumDate;
                if (node.value && node.value < returnMinimumDate) {
                    node.value = returnMinimumDate;
                }
            });

            const selectedReturnDate = returnDateNode?.value || quickReturnDateNode?.value || '';
            const selectedRideTime = rideTimeNode?.value || quickTimeNode?.value || '';
            const returnMinimumTime = selectedReturnDate && selectedReturnDate === selectedRideDate && selectedRideTime
                ? selectedRideTime
                : '';
            [returnTimeNode, quickReturnTimeNode].forEach((node) => {
                if (!node) return;
                node.min = returnMinimumTime;
                if (returnMinimumTime && node.value && node.value <= returnMinimumTime) {
                    node.value = '';
                }
            });
        }

        function seedDefaultBookingDateTime() {
            const defaultStart = getDefaultBookingStartDateTime();
            const defaultDate = formatLocalDateInputValue(defaultStart);
            const defaultTime = formatLocalTimeInputValue(defaultStart);
            const values = [
                ['rideDate', defaultDate],
                ['cabQuickDateInput', defaultDate],
                ['rideTime', defaultTime],
                ['cabQuickTimeInput', defaultTime]
            ];

            values.forEach(([id, value]) => {
                const node = document.getElementById(id);
                if (node && !node.value) node.value = value;
            });
            syncBookingDateTimeLimits();
        }

        function formatCabStartText(dateValue, timeValue) {
            if (!dateValue && !timeValue) return 'Choose date and time';
            const dateTime = dateValue ? new Date(`${dateValue}T${timeValue || '00:00'}`) : null;
            if (dateTime && !Number.isNaN(dateTime.getTime())) {
                const formattedDate = dateTime.toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });
                const formattedTime = timeValue
                    ? dateTime.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
                    : 'Select time';
                return `${formattedDate}, ${formattedTime}`;
            }
            return `${dateValue || 'Choose date'}, ${timeValue || 'Select time'}`;
        }

        function getCabJourneyMode() {
            return document.querySelector('input[name="journeyMode"]:checked')?.value || 'one_way';
        }

        function isCabRoundTripActive(flow = getActiveCabFlow()) {
            return (flow === 'outstation' && getCabJourneyMode() === 'round_trip')
                || (flow === 'airport' && Boolean(getAirportServiceConfig().requiresReturn));
        }

        function syncCabRoundTripUi(flow = getActiveCabFlow()) {
            const journeyMode = getCabJourneyMode();
            const isOutstation = flow === 'outstation';
            const isAirportRoundTrip = flow === 'airport' && Boolean(getAirportServiceConfig().requiresReturn);
            const isRoundTrip = (isOutstation && journeyMode === 'round_trip') || isAirportRoundTrip;
            const consoleNode = document.getElementById('cabBookingConsole');
            const quickReturnDate = document.getElementById('cabQuickReturnDateInput');
            const quickReturnTime = document.getElementById('cabQuickReturnTimeInput');
            const returnDateNode = document.getElementById('returnDate');
            const returnTimeNode = document.getElementById('returnTime');
            const rideDateNode = document.getElementById('rideDate');

            if (consoleNode) {
                consoleNode.classList.toggle('is-one-way', isOutstation && journeyMode === 'one_way');
                consoleNode.classList.toggle('is-round-trip', isRoundTrip);
                consoleNode.classList.toggle('is-multi-city', isOutstation && journeyMode === 'multi_city');
            }
            if (document.body) {
                document.body.classList.toggle('cab-one-way-active', isOutstation && journeyMode === 'one_way');
                document.body.classList.toggle('cab-round-trip-active', isRoundTrip);
                document.body.classList.toggle('cab-multi-city-active', isOutstation && journeyMode === 'multi_city');
            }

            if (quickReturnDate) {
                quickReturnDate.required = isRoundTrip;
                quickReturnDate.min = isRoundTrip ? (rideDateNode?.value || '') : '';
                setQuickControlValue('cabQuickReturnDateInput', isRoundTrip ? (returnDateNode?.value || '') : '');
            }
            if (quickReturnTime) {
                quickReturnTime.required = isRoundTrip;
                setQuickControlValue('cabQuickReturnTimeInput', isRoundTrip ? (returnTimeNode?.value || '') : '');
            }
        }

        function syncCabQuickFields() {
            const pickup = sanitizeInput(document.getElementById('pickup')?.value || '').trim();
            const dropoff = sanitizeInput(document.getElementById('dropoff')?.value || '').trim();
            const rideDate = document.getElementById('rideDate')?.value || '';
            const rideTime = document.getElementById('rideTime')?.value || '';
            const returnDate = document.getElementById('returnDate')?.value || '';
            const returnTime = document.getElementById('returnTime')?.value || '';
            const activeFlow = getActiveCabFlow();
            const config = getCabFlowConfig(activeFlow);
            const tripLabel = readSelectedOptionText('tripPlan', config.packageLabel);
            const modelLabel = readSelectedOptionText('vehicleModel', 'Hatchback Car');
            const airportPackageActive = activeFlow === 'airport' && isAirportPackageMode();

            setQuickControlValue('cabQuickPickupInput', pickup);
            setQuickControlValue('cabQuickDropoffInput', dropoff);
            setQuickControlValue('cabQuickDateInput', rideDate);
            setQuickControlValue('cabQuickTimeInput', rideTime);
            setQuickControlValue('cabQuickReturnDateInput', returnDate);
            setQuickControlValue('cabQuickReturnTimeInput', returnTime);
            syncPackageSelectOptions(activeFlow);
            setQuickControlValue('cabQuickPackageSelect', resolveCabPackageValue(activeFlow));
            const selectedLocalPackage = readSelectedOptionText('cabQuickPackageSelect', config.packageLabel);
            syncCabRoundTripUi(activeFlow);
            setTextIfPresent('cabQuickPackageLabel', activeFlow === 'day_trips'
                ? 'Day Plan'
                : airportPackageActive ? (getAirportServiceMode() === 'airport_day' ? 'Airport Days' : 'Airport Package') : 'Package');
            setTextIfPresent('cabQuickFrom', pickup || 'Select pickup location');
            setTextIfPresent('cabQuickTo', dropoff || (activeFlow === 'day_trips' ? 'Within city rental area' : 'Select drop location'));
            setTextIfPresent('cabQuickStart', formatCabStartText(rideDate, rideTime));
            setTextIfPresent('cabQuickPackage', activeFlow === 'day_trips' || airportPackageActive ? `${selectedLocalPackage} • ${modelLabel}` : tripLabel);
        }

        function syncCabMiniFare(estimate = {}) {
            const values = estimate && typeof estimate === 'object' ? estimate : {};
            const total = Number(values.totalFare || values.amount || 0);
            const distanceKm = Number(values.distanceKm || 0);
            const vehicleLabel = readSelectedOptionText('vehicleModel', 'Hatchback Car');
            const flowLabel = getCabFlowConfig(getActiveCabFlow()).shortLabel;
            const ready = routeIsReady(values);

            setTextIfPresent('cabMiniTotalFare', formatCurrency(total));
            setTextIfPresent('cabMiniDistance', `${Math.max(0, Math.round(distanceKm))} km`);
            setTextIfPresent('cabMiniVehicle', vehicleLabel);
            setTextIfPresent('cabMiniFareMode', flowLabel);
            setTextIfPresent(
                'cabMiniFareMeta',
                ready
                    ? `${flowLabel} estimate includes route, time, toll, tax and selected extras.`
                    : 'Enter pickup and drop to calculate route-aware fare.'
            );
            setTextIfPresent(
                'cabMiniRouteStatus',
                ready
                    ? 'Route ready for admin approval and driver dispatch.'
                    : 'Admin approval before driver assignment'
            );
        }

        let cabLayerManualIndex = null;
        let cabLayerUnlockedIndex = 0;
        let cabLayerFlowSnapshot = '';

        function resetCabLayerProgress(flow = getActiveCabFlow()) {
            cabLayerManualIndex = null;
            cabLayerUnlockedIndex = 0;
            cabLayerFlowSnapshot = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
        }

        function focusCabLayerInput(layerNode, scroll = false) {
            if (!layerNode) return;
            const inputNode = layerNode.querySelector('input, select, textarea');
            if (!inputNode) return;
            if (scroll) {
                layerNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            if (typeof inputNode.focus === 'function') {
                window.setTimeout(() => inputNode.focus({ preventScroll: true }), 40);
            }
        }

        function advanceCabLayerIfCurrentComplete(layerKey) {
            const activeFlow = getActiveCabFlow();
            const layers = buildCabQuickLayers(activeFlow);
            if (!layers.length) return;

            if (cabLayerFlowSnapshot !== activeFlow) {
                resetCabLayerProgress(activeFlow);
            }

            const lastLayerIndex = layers.length - 1;
            cabLayerUnlockedIndex = Math.max(0, Math.min(cabLayerUnlockedIndex, lastLayerIndex));
            const activeIndex = Number.isInteger(cabLayerManualIndex) ? cabLayerManualIndex : cabLayerUnlockedIndex;
            const changedIndex = layers.findIndex((layer) => layer.key === layerKey);
            if (changedIndex < 0 || changedIndex !== activeIndex) {
                syncCabLayerFlow(activeFlow);
                return;
            }

            const currentLayer = layers[activeIndex];
            if (!currentLayer || !currentLayer.complete()) {
                syncCabLayerFlow(activeFlow);
                return;
            }

            if (activeIndex < lastLayerIndex) {
                cabLayerManualIndex = null;
                cabLayerUnlockedIndex = Math.min(lastLayerIndex, activeIndex + 1);
                syncCabLayerFlow(activeFlow);
                const nextLayer = layers[cabLayerUnlockedIndex];
                focusCabLayerInput(nextLayer && nextLayer.node, true);
                return;
            }

            syncCabLayerFlow(activeFlow);
        }

        function formatMiniLayerDate(value) {
            if (!value) return 'Select date';
            const dateNode = new Date(`${value}T00:00`);
            if (Number.isNaN(dateNode.getTime())) return value;
            return dateNode.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        function formatMiniLayerTime(value) {
            if (!value) return 'Select time';
            const dateNode = new Date(`1970-01-01T${value}`);
            if (Number.isNaN(dateNode.getTime())) return value;
            return dateNode.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
        }

        function ensureCabLayerValueNode(layerNode) {
            if (!layerNode) return null;
            let valueNode = layerNode.querySelector('.cab-layer-value');
            if (!valueNode) {
                valueNode = document.createElement('small');
                valueNode.className = 'cab-layer-value';
                layerNode.appendChild(valueNode);
            }
            return valueNode;
        }

        function getRouteStopInputs() {
            return Array.from(document.querySelectorAll('[data-route-stop-input]'));
        }

        function readRouteStops() {
            return getRouteStopInputs()
                .map((input) => sanitizeInput(input.value || '').trim())
                .filter(Boolean);
        }

        function buildBookingRouteStopLocationSnapshot() {
            return getRouteStopInputs()
                .map((input, index) => {
                    const address = sanitizeInput(input.value || '').trim();
                    const point = getBookingMapDatasetCoords(input);
                    if (!address && !point) return null;
                    return {
                        index: index + 1,
                        address,
                        coordinates: point || null,
                        googleMapsUrl: point ? buildBookingMapPointUrl(point) : ''
                    };
                })
                .filter(Boolean);
        }

        function buildBookingLocationSnapshot() {
            const pickupInput = document.getElementById('pickup');
            const dropoffInput = document.getElementById('dropoff');
            const pickupPoint = getBookingMapCoordsForTarget('pickup');
            const dropoffPoint = getBookingMapCoordsForTarget('dropoff');
            const stops = buildBookingRouteStopLocationSnapshot();
            return {
                pickup: {
                    address: sanitizeInput(pickupInput?.value || '').trim(),
                    coordinates: pickupPoint || null,
                    googleMapsUrl: pickupPoint ? buildBookingMapPointUrl(pickupPoint) : ''
                },
                dropoff: {
                    address: sanitizeInput(dropoffInput?.value || '').trim(),
                    coordinates: dropoffPoint || null,
                    googleMapsUrl: dropoffPoint ? buildBookingMapPointUrl(dropoffPoint) : ''
                },
                stops,
                accuracy: {
                    pickup: Number.isFinite(Number(pickupPoint?.accuracy)) ? Number(pickupPoint.accuracy) : null,
                    dropoff: Number.isFinite(Number(dropoffPoint?.accuracy)) ? Number(dropoffPoint.accuracy) : null
                },
                source: 'booking_google_map_exact_location'
            };
        }

        function updateRouteStopLabels() {
            const airportConfig = getActiveCabFlow() === 'airport' ? getAirportServiceConfig() : {};
            const isAirportFullDayStops = Boolean(airportConfig.optionalStops);
            getRouteStopInputs().forEach((input, index) => {
                const routeNumber = index + 1;
                input.id = `stop${routeNumber}`;
                input.name = `stops[]`;
                input.placeholder = isAirportFullDayStops
                    ? (routeNumber === 1 ? 'Add city stop, meeting, hotel or route point' : 'Add another full-day stop')
                    : (routeNumber === 1 ? 'Add intermediate route / stop' : 'Add another route / stop');
                const label = input.closest('[data-route-stop-row]')?.querySelector('label');
                if (label) {
                    label.setAttribute('for', input.id);
                    label.textContent = `${isAirportFullDayStops ? 'Stop' : 'Route'} ${routeNumber} (Optional)`;
                }
                const removeButton = input.closest('[data-route-stop-row]')?.querySelector('[data-route-stop-remove]');
                if (removeButton) {
                    const hasValue = Boolean((input.value || '').trim());
                    removeButton.hidden = getRouteStopInputs().length <= 1 && !hasValue;
                    removeButton.setAttribute('aria-label', `Remove ${isAirportFullDayStops ? 'stop' : 'route'} ${routeNumber}`);
                }
            });
        }

        function createRouteStopField(value = '') {
            const row = document.createElement('div');
            row.className = 'route-stop-field';
            row.setAttribute('data-route-stop-row', '1');
            row.innerHTML = `
                <label></label>
                <div class="route-stop-input-wrap">
                    <input type="text" class="route-stop-input" data-route-stop-input autocomplete="off" oninput="handleRouteStopInputChange()">
                    <button type="button" class="route-stop-current-btn" data-map-current-target="stop" aria-label="Use current location for this stop" title="Use current location for this stop">
                        <i class="fas fa-location-arrow"></i>
                    </button>
                    <button type="button" class="route-stop-remove-btn" data-route-stop-remove aria-label="Remove route" onclick="removeRouteStop(this)">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            const input = row.querySelector('input');
            if (input) input.value = value || '';
            return row;
        }

        function addRouteStop(value = '', focusNew = true) {
            const list = document.getElementById('routeStopsList');
            if (!list) return null;
            const row = createRouteStopField(value);
            list.appendChild(row);
            updateRouteStopLabels();
            const input = row.querySelector('[data-route-stop-input]');
            if (input && typeof initializeAutocomplete === 'function') {
                initializeAutocomplete(input.id);
            }
            if (focusNew && input && typeof input.focus === 'function') {
                window.setTimeout(() => input.focus({ preventScroll: true }), 40);
            }
            return input;
        }

        function removeRouteStop(button) {
            const row = button?.closest('[data-route-stop-row]');
            const input = row?.querySelector('[data-route-stop-input]');
            const stops = getRouteStopInputs();
            if (!row || !input) return;

            if (stops.length <= 1) {
                input.value = '';
                input.focus({ preventScroll: true });
            } else {
                row.remove();
            }

            updateRouteStopLabels();
            updateFare();
            updateBookingExperience();
        }

        function ensureRouteStopsReady() {
            const list = document.getElementById('routeStopsList');
            if (!list) return;
            if (!getRouteStopInputs().length) {
                list.appendChild(createRouteStopField());
            }
            updateRouteStopLabels();
        }

        function handleRouteStopInputChange() {
            updateRouteStopLabels();
            updateFare();
            updateBookingExperience();
        }

        function isCabLocationLayerComplete(inputId, inputNode) {
            const value = String(inputNode?.value || '').trim();
            if (value.length < 3) return false;

            if (getActiveCabFlow() === 'airport' && getAirportFieldRole(inputId) === 'airport') {
                return isAirportTextResolvable(value, {
                    contextText: getAirportContextTextForInput(inputNode)
                });
            }

            return true;
        }

        function buildCabQuickLayers(flow = getActiveCabFlow()) {
            const pickupNode = document.getElementById('cabQuickPickupInput');
            const dropoffNode = document.getElementById('cabQuickDropoffInput');
            const dateNode = document.getElementById('cabQuickDateInput');
            const timeNode = document.getElementById('cabQuickTimeInput');
            const returnDateNode = document.getElementById('cabQuickReturnDateInput');
            const returnTimeNode = document.getElementById('cabQuickReturnTimeInput');
            const packageNode = document.getElementById('cabQuickPackageSelect');

            const baseLayers = [
                {
                    key: 'pickup',
                    label: 'Pickup',
                    inputId: 'cabQuickPickupInput',
                    node: pickupNode ? pickupNode.closest('.cab-mini-field') : null,
                    complete: () => isCabLocationLayerComplete('cabQuickPickupInput', pickupNode),
                    valueText: () => sanitizeInput(pickupNode?.value || '').trim(),
                    pendingText: 'Enter pickup location'
                },
                {
                    key: 'dropoff',
                    label: 'Dropoff',
                    inputId: 'cabQuickDropoffInput',
                    node: dropoffNode ? dropoffNode.closest('.cab-mini-field') : null,
                    complete: () => isCabLocationLayerComplete('cabQuickDropoffInput', dropoffNode),
                    valueText: () => sanitizeInput(dropoffNode?.value || '').trim(),
                    pendingText: 'Enter drop location'
                },
                {
                    key: 'date',
                    label: 'Trip date',
                    node: dateNode ? dateNode.closest('.cab-mini-field') : null,
                    complete: () => Boolean(dateNode?.value),
                    valueText: () => formatMiniLayerDate(dateNode?.value || ''),
                    pendingText: 'Select trip date'
                },
                {
                    key: 'time',
                    label: 'Trip time',
                    node: timeNode ? timeNode.closest('.cab-mini-field') : null,
                    complete: () => Boolean(timeNode?.value),
                    valueText: () => formatMiniLayerTime(timeNode?.value || ''),
                    pendingText: 'Select pickup time'
                }
            ];

            if ((flow === 'outstation' && getCabJourneyMode() === 'round_trip')
                || (flow === 'airport' && Boolean(getAirportServiceConfig().requiresReturn))) {
                baseLayers.push(
                    {
                        key: 'returnDate',
                        label: 'Return date',
                        node: returnDateNode ? returnDateNode.closest('.cab-mini-field') : null,
                        complete: () => Boolean(returnDateNode?.value),
                        valueText: () => formatMiniLayerDate(returnDateNode?.value || ''),
                        pendingText: 'Select return date'
                    },
                    {
                        key: 'returnTime',
                        label: 'Return time',
                        node: returnTimeNode ? returnTimeNode.closest('.cab-mini-field') : null,
                        complete: () => Boolean(returnTimeNode?.value),
                        valueText: () => formatMiniLayerTime(returnTimeNode?.value || ''),
                        pendingText: 'Select return time'
                    }
                );
            }

            if (flow === 'day_trips') {
                baseLayers.splice(1, 1);
                baseLayers.push({
                    key: 'package',
                    label: 'Day plan',
                    node: packageNode ? packageNode.closest('.cab-mini-field') : null,
                    complete: () => Boolean(packageNode?.value),
                    valueText: () => packageNode?.options?.[packageNode.selectedIndex]?.text || '',
                    pendingText: 'Select day plan'
                });
            }

            if (flow === 'airport' && Boolean(getAirportServiceConfig().requiresPackage)) {
                const isFullDayAirport = getAirportServiceMode() === 'airport_day';
                baseLayers.push({
                    key: 'package',
                    label: isFullDayAirport ? 'Airport days' : 'Airport package',
                    node: packageNode ? packageNode.closest('.cab-mini-field') : null,
                    complete: () => Boolean(packageNode?.value),
                    valueText: () => packageNode?.options?.[packageNode.selectedIndex]?.text || '',
                    pendingText: isFullDayAirport ? 'Select duty days' : 'Select airport package'
                });
            }

            return baseLayers.filter((layer) => layer.node);
        }

        function syncCabLayerFlow(flow = getActiveCabFlow()) {
            const activeFlow = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
            const layers = buildCabQuickLayers(activeFlow);
            if (!layers.length) return;

            if (cabLayerFlowSnapshot !== activeFlow) {
                resetCabLayerProgress(activeFlow);
            }

            const firstIncompleteIndex = layers.findIndex((layer) => !layer.complete());
            const lastLayerIndex = layers.length - 1;
            if (firstIncompleteIndex !== -1 && firstIncompleteIndex < cabLayerUnlockedIndex) {
                cabLayerUnlockedIndex = firstIncompleteIndex;
            }
            cabLayerUnlockedIndex = Math.max(0, Math.min(cabLayerUnlockedIndex, lastLayerIndex));

            if (Number.isInteger(cabLayerManualIndex)) {
                const manualLayer = layers[cabLayerManualIndex];
                if (!manualLayer || cabLayerManualIndex > cabLayerUnlockedIndex) {
                    cabLayerManualIndex = null;
                }
            }

            const activeIndex = Number.isInteger(cabLayerManualIndex) ? cabLayerManualIndex : cabLayerUnlockedIndex;

            layers.forEach((layer, index) => {
                const node = layer.node;
                const isComplete = layer.complete();
                const isCurrent = index === activeIndex;
                const isHidden = index > activeIndex;
                const isCollapsed = index < activeIndex;

                node.classList.add('cab-layer');
                node.classList.toggle('is-layer-current', isCurrent);
                node.classList.toggle('is-layer-complete', isComplete);
                node.classList.toggle('is-layer-hidden', isHidden);
                node.classList.toggle('is-layer-collapsed', isCollapsed);

                const valueNode = ensureCabLayerValueNode(node);
                if (valueNode) {
                    valueNode.textContent = layer.valueText() || layer.pendingText;
                }

                if (node.dataset.cabLayerBound !== '1') {
                    node.addEventListener('click', (event) => {
                        const host = event.currentTarget;
                        if (!host || !host.classList.contains('is-layer-collapsed')) return;
                        const currentLayers = buildCabQuickLayers(getActiveCabFlow());
                        const clickedIndex = currentLayers.findIndex((item) => item.node === host);
                        if (clickedIndex < 0) return;
                        if (clickedIndex > cabLayerUnlockedIndex) return;
                        cabLayerManualIndex = clickedIndex;
                        syncCabLayerFlow(getActiveCabFlow());
                        focusCabLayerInput(host, false);
                    });
                    node.dataset.cabLayerBound = '1';
                }
            });

            const currentLayer = layers[Math.max(0, activeIndex)] || null;
            const currentLayerReady = Boolean(currentLayer && currentLayer.complete());
            const searchButton = document.getElementById('cabPrimarySearch');
            const helperNode = document.querySelector('#cabModeNotice .cab-layer-helper') || (() => {
                const host = document.getElementById('cabModeNotice');
                if (!host) return null;
                const helper = document.createElement('small');
                helper.className = 'cab-layer-helper';
                host.appendChild(helper);
                return helper;
            })();

            const advancedReady = Boolean(document.body?.classList.contains('booking-advanced-ready'));
            const advancedSections = advancedReady ? getServiceVisibleSections(activeFlow) : [];
            const advancedIndex = advancedReady ? getServiceFolderProgressIndex(activeFlow, advancedSections) : 0;
            const advancedCurrentSection = advancedReady && advancedSections.length
                ? advancedSections[Math.max(0, Math.min(advancedIndex, advancedSections.length - 1))]
                : null;
            const advancedCurrentComplete = advancedCurrentSection
                ? isBookingStepComplete(advancedCurrentSection.dataset.stepKey || '', activeFlow)
                : false;

            if (searchButton) {
                if (advancedReady && advancedSections.length) {
                    const isAdvancedFinal = advancedIndex >= advancedSections.length - 1;
                    searchButton.disabled = !advancedCurrentComplete;
                    searchButton.classList.toggle('is-layer-locked', !advancedCurrentComplete);
                    searchButton.setAttribute('aria-disabled', advancedCurrentComplete ? 'false' : 'true');
                    searchButton.textContent = isAdvancedFinal ? 'FINAL SUBMIT' : 'NEXT';
                } else {
                    searchButton.disabled = !currentLayerReady;
                    searchButton.classList.toggle('is-layer-locked', !currentLayerReady);
                    searchButton.setAttribute('aria-disabled', currentLayerReady ? 'false' : 'true');
                    searchButton.textContent = 'NEXT';
                }
            }

            const backButton = document.getElementById('cabStepBackBtn');
            if (backButton) {
                const actionRow = backButton.closest('.cab-console-actions');
                let showBack = false;
                if (advancedReady && advancedSections.length) {
                    showBack = true;
                    backButton.disabled = false;
                } else {
                    showBack = activeIndex > 0;
                    backButton.disabled = !showBack;
                }
                backButton.style.display = showBack ? 'inline-flex' : 'none';
                if (actionRow) actionRow.classList.toggle('has-step-back', showBack);
            }

            const routeAddons = document.getElementById('cabRouteAddons');
            if (routeAddons) {
                const pickupReady = layers
                    .filter((layer) => layer.key === 'pickup')
                    .every((layer) => layer.complete());
                const dropoffLayers = layers.filter((layer) => layer.key === 'dropoff');
                const dropoffReady = !dropoffLayers.length || dropoffLayers.every((layer) => layer.complete());
                const routeTitle = routeAddons.querySelector('.cab-route-addons-title span');
                const routeHint = routeAddons.querySelector('.cab-route-addons-title small');
                const isLocalRental = activeFlow === 'day_trips';
                const airportConfig = activeFlow === 'airport' ? getAirportServiceConfig() : {};
                const isAirportFullDayStops = Boolean(airportConfig.optionalStops);
                const isAirportMulti = activeFlow === 'airport' && Boolean(airportConfig.routeAddons);
                const isAirportStopAddon = isAirportMulti || isAirportFullDayStops;
                const showRouteAddons = isLocalRental
                    ? pickupReady
                    : isAirportStopAddon
                        ? pickupReady && dropoffReady
                        : activeFlow === 'outstation'
                            && getCabJourneyMode() === 'multi_city'
                            && pickupReady
                            && dropoffReady;
                if (routeTitle) {
                    routeTitle.innerHTML = isLocalRental
                        ? '<i class="fas fa-map-signs"></i> Local Stops'
                        : isAirportStopAddon
                            ? (isAirportFullDayStops ? '<i class="fas fa-map-signs"></i> Full Day Stops' : '<i class="fas fa-map-signs"></i> Airport Stops')
                            : '<i class="fas fa-map-signs"></i> Route Add-ons';
                }
                if (routeHint) {
                    routeHint.textContent = isLocalRental
                        ? 'Shopping, meetings, sightseeing stops'
                        : isAirportStopAddon
                            ? (isAirportFullDayStops ? 'Optional: add meeting, hotel, city or route stops' : 'Add hotel, meeting, terminal or route stops')
                            : 'Add routes/stops as needed';
                }
                routeAddons.classList.toggle('is-visible', showRouteAddons);
                routeAddons.hidden = !showRouteAddons;
                routeAddons.setAttribute('aria-hidden', showRouteAddons ? 'false' : 'true');
            }

            if (helperNode) {
                if (advancedReady && advancedSections.length) {
                    const totalSteps = layers.length + advancedSections.length;
                    const activeStep = layers.length + Math.max(1, advancedIndex + 1);
                    helperNode.textContent = `Step ${activeStep}/${totalSteps}`;
                } else {
                    helperNode.textContent = `Step ${Math.max(1, activeIndex + 1)}/${layers.length}`;
                }
            }
            syncCabStageLayout();
        }
        function syncCabModeUi(flow = getActiveCabFlow()) {
            const activeFlow = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
            const config = getCabFlowConfig(activeFlow);
            const airportConfig = getAirportServiceConfig();
            const consoleNode = document.getElementById('cabBookingConsole');
            if (consoleNode) {
                consoleNode.classList.remove('is-airport', 'is-local', 'is-outstation', 'is-hourly', 'is-airport-package', 'is-airport-multi', 'is-airport-transfer');
                consoleNode.classList.add(activeFlow === 'day_trips' ? 'is-hourly' : `is-${activeFlow}`);
                consoleNode.classList.toggle('is-airport-package', activeFlow === 'airport' && Boolean(airportConfig.requiresPackage));
                consoleNode.classList.toggle('is-airport-multi', activeFlow === 'airport' && Boolean(airportConfig.routeAddons));
                consoleNode.classList.toggle('is-airport-transfer', activeFlow === 'airport' && isMergedAirportTransferMode(getAirportServiceMode()));
            }
            if (document.body) {
                document.body.classList.remove('cab-flow-airport', 'cab-flow-local', 'cab-flow-outstation', 'cab-flow-hourly');
                document.body.classList.add(activeFlow === 'day_trips' ? 'cab-flow-hourly' : `cab-flow-${activeFlow}`);
            }

            document.querySelectorAll('[data-flow-target]').forEach((button) => {
                const isActive = button.dataset.flowTarget === activeFlow;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            document.querySelectorAll('#tripFlowPills .trip-flow-pill').forEach((button) => {
                button.classList.toggle('is-active', button.dataset.flow === activeFlow);
            });

            const noticeText = document.querySelector('#cabModeNotice span');
            if (noticeText) noticeText.textContent = activeFlow === 'airport' ? airportConfig.notice : config.notice;

            syncAirportServiceChips();
            syncPackageSelectOptions(activeFlow);
            syncAirportOnlyFieldUi(activeFlow);
            syncCabScopedSelectOptions(activeFlow);
            syncCabQuickFields();
            syncCabLayerFlow(activeFlow);
        }

        function setCabJourneyMode(mode, options = {}) {
            const normalized = ['one_way', 'round_trip', 'multi_city'].includes(mode) ? mode : 'one_way';
            document.querySelectorAll('input[name="journeyMode"]').forEach((radio) => {
                radio.checked = radio.value === normalized;
            });
            document.querySelectorAll('[data-journey-target]').forEach((button) => {
                button.classList.toggle('is-active', button.dataset.journeyTarget === normalized);
            });

            const returnToggle = document.getElementById('isReturnTrip');
            if (returnToggle && options.syncReturnTrip !== false) {
                returnToggle.checked = normalized === 'round_trip';
                toggleReturnTrip();
                if (normalized === 'multi_city') {
                    ensureRouteStopsReady();
                    const stopField = getRouteStopInputs()[0];
                    if (stopField && !stopField.value) {
                        stopField.placeholder = 'Add first stop for multi-city journey';
                    }
                }
                if (options.skipFare !== true) updateFare();
            }

            syncCabRoundTripUi(getActiveCabFlow());
            syncCabScopedSelectOptions(getActiveCabFlow());
            syncCabLayerFlow(getActiveCabFlow());
            updateBookingExperience();
        }

        function setCabBookingMode(flow, options = {}) {
            const activeFlow = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
            const config = getCabFlowConfig(activeFlow);
            const hiddenNode = document.getElementById('tripFlow');
            const tripPlanNode = document.getElementById('tripPlan');
            const serviceTypeNode = document.getElementById('tripServiceType');

            if (hiddenNode) hiddenNode.value = activeFlow;
            if (options.syncTripPlan !== false && tripPlanNode && config.tripPlan) {
                tripPlanNode.value = config.tripPlan;
            }
            if (serviceTypeNode && config.serviceType) {
                serviceTypeNode.value = config.serviceType;
            }
            syncCabScopedSelectOptions(activeFlow);

            if (document.body) {
                document.body.classList.remove('booking-advanced-ready');
            }
            resetCabLayerProgress(activeFlow);
            resetServiceFolderProgress(activeFlow);
            syncCabModeUi(activeFlow);
            if (options.skipFare !== true) updateFare();
            else updateBookingExperience();
        }

        function revealFieldFromShortcut(fieldId) {
            if (!fieldId) return;
            revealBookingField(fieldId);
            const field = document.getElementById(fieldId);
            if (field) {
                window.setTimeout(() => field.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
            }
        }

        function openNextAdvancedBookingStep() {
            const flow = getActiveCabFlow();
            const drawer = document.getElementById('advancedBookingDrawer');
            if (document.body) {
                document.body.classList.add('booking-advanced-ready');
            }
            if (drawer) drawer.open = true;

            const sections = getServiceVisibleSections(flow);
            if (!sections.length) return;

            const progressIndex = getServiceFolderProgressIndex(flow, sections);
            const targetSection = sections[Math.max(0, Math.min(progressIndex, sections.length - 1))];

            setActiveAccordionSection(sections, targetSection);
            syncServiceFolderVisibility(flow);
            syncCabLayerFlow(flow);
            syncCabStageLayout();

            const focusTarget = targetSection.querySelector('input:not([type="hidden"]), select, textarea');
            if (focusTarget && typeof focusTarget.focus === 'function') {
                window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 60);
            }
            window.setTimeout(() => {
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        }

        function handleCabPrimarySearch() {
            const activeFlow = getActiveCabFlow();
            resolveCabQuickLocationValues({
                showSuggestions: false,
                useVisibleSuggestion: true
            });
            const layers = buildCabQuickLayers(activeFlow);
            if (!layers.length) return;

            if (cabLayerFlowSnapshot !== activeFlow) {
                resetCabLayerProgress(activeFlow);
            }

            const lastLayerIndex = layers.length - 1;
            cabLayerUnlockedIndex = Math.max(0, Math.min(cabLayerUnlockedIndex, lastLayerIndex));
            const activeIndex = Number.isInteger(cabLayerManualIndex) ? cabLayerManualIndex : cabLayerUnlockedIndex;
            const currentLayer = layers[Math.max(0, activeIndex)] || null;
            const currentLayerInput = currentLayer?.inputId ? document.getElementById(currentLayer.inputId) : null;

            if (currentLayerInput && getActiveCabFlow() === 'airport' && getAirportFieldRole(currentLayerInput.id) === 'airport') {
                const resolved = resolveAirportInputValue(currentLayerInput, { showSuggestions: true });
                if (!resolved) {
                    syncCabLayerFlow(activeFlow);
                    focusCabLayerInput(currentLayer && currentLayer.node, true);
                    return;
                }
            }

            if (!currentLayer || !currentLayer.complete()) {
                syncCabLayerFlow(activeFlow);
                focusCabLayerInput(currentLayer && currentLayer.node, true);
                return;
            }

            if (activeIndex < lastLayerIndex) {
                cabLayerManualIndex = null;
                cabLayerUnlockedIndex = Math.min(lastLayerIndex, activeIndex + 1);
                syncCabLayerFlow(activeFlow);
                const nextLayer = layers[cabLayerUnlockedIndex];
                focusCabLayerInput(nextLayer && nextLayer.node, true);
                return;
            }

            const journeyMode = getCabJourneyMode();
            const requiredFieldIds = activeFlow === 'day_trips'
                ? ['pickup', 'rideDate', 'rideTime']
                : ['pickup', 'dropoff', 'rideDate', 'rideTime'];
            if ((activeFlow === 'outstation' && journeyMode === 'round_trip')
                || (activeFlow === 'airport' && Boolean(getAirportServiceConfig().requiresReturn))) {
                requiredFieldIds.push('returnDate', 'returnTime');
            }
            const missingField = requiredFieldIds.find((id) => !String(document.getElementById(id)?.value || '').trim());
            if (missingField) {
                const quickFieldMap = {
                    pickup: 'cabQuickPickupInput',
                    dropoff: 'cabQuickDropoffInput',
                    rideDate: 'cabQuickDateInput',
                    rideTime: 'cabQuickTimeInput',
                    returnDate: 'cabQuickReturnDateInput',
                    returnTime: 'cabQuickReturnTimeInput'
                };
                const quickField = document.getElementById(quickFieldMap[missingField] || '');
                if (quickField) {
                    quickField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (typeof quickField.focus === 'function') {
                        window.setTimeout(() => quickField.focus({ preventScroll: true }), 40);
                    }
                    return;
                }
                revealFieldFromShortcut(missingField);
                return;
            }

            if (activeFlow === 'airport' && isAirportTerminalDetailRequired()) {
                const terminalField = document.getElementById('cabQuickTerminalInput');
                const terminalValue = sanitizeInput(terminalField?.value || '').trim();
                if (!terminalValue) {
                    showError('Please enter airport terminal, gate, pillar or pickup/drop point');
                    if (terminalField) {
                        terminalField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        window.setTimeout(() => terminalField.focus({ preventScroll: true }), 40);
                    }
                    return;
                }
            }

            if (activeFlow === 'outstation' && journeyMode === 'multi_city' && !readRouteStops().length) {
                ensureRouteStopsReady();
                const firstStop = getRouteStopInputs()[0];
                if (firstStop) {
                    firstStop.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    window.setTimeout(() => firstStop.focus({ preventScroll: true }), 40);
                }
                return;
            }

            if (activeFlow === 'day_trips') {
                const pickupValue = sanitizeInput(document.getElementById('pickup')?.value || '').trim();
                const dropoffNode = document.getElementById('dropoff');
                if (pickupValue && dropoffNode && !String(dropoffNode.value || '').trim()) {
                    dropoffNode.value = `Day plan within ${pickupValue}`;
                }
            }

            updateDistanceEstimate();
            updateFare();
            const sections = getServiceVisibleSections(activeFlow);
            if (!sections.length) return;

            if (!document.body?.classList.contains('booking-advanced-ready')) {
                setServiceFolderProgressIndex(activeFlow, 0, sections);
                openNextAdvancedBookingStep();
                return;
            }

            const currentIndex = getServiceFolderProgressIndex(activeFlow, sections);
            const currentSection = sections[Math.max(0, Math.min(currentIndex, sections.length - 1))];
            const currentComplete = isBookingStepComplete(currentSection?.dataset?.stepKey || '', activeFlow);
            if (!currentComplete) {
                const focusTarget = currentSection?.querySelector('input:not([type="hidden"]), select, textarea');
                if (focusTarget && typeof focusTarget.focus === 'function') {
                    focusTarget.focus({ preventScroll: true });
                }
                return;
            }

            if (currentIndex < sections.length - 1) {
                setServiceFolderProgressIndex(activeFlow, currentIndex + 1, sections);
                openNextAdvancedBookingStep();
                return;
            }

            const form = document.getElementById('bookingForm');
            if (form && typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                handleBookingFormSubmit();
            }
        }

        function initInternationalCabBookingUI() {
            document.querySelectorAll('[data-flow-target]').forEach((button) => {
                if (button.dataset.cabBound === '1') return;
                button.addEventListener('click', () => {
                    setCabBookingMode(button.dataset.flowTarget || 'airport');
                });
                button.dataset.cabBound = '1';
            });

            document.querySelectorAll('[data-journey-target]').forEach((button) => {
                if (button.dataset.cabBound === '1') return;
                button.addEventListener('click', () => {
                    setCabJourneyMode(button.dataset.journeyTarget || 'one_way');
                });
                button.dataset.cabBound = '1';
            });

            document.querySelectorAll('[data-airport-service]').forEach((button) => {
                if (button.dataset.airportServiceBound === '1') return;
                button.addEventListener('click', () => {
                    setAirportServiceMode(button.dataset.airportService || 'airport_drop');
                });
                button.dataset.airportServiceBound = '1';
            });

            document.querySelectorAll('[data-airport-transfer-variant]').forEach((button) => {
                if (button.dataset.airportTransferBound === '1') return;
                button.addEventListener('click', () => {
                    setAirportServiceMode(button.dataset.airportTransferVariant || 'airport_to_airport');
                });
                button.dataset.airportTransferBound = '1';
            });

            document.querySelectorAll('[data-reveal-field]').forEach((button) => {
                if (button.dataset.revealBound === '1') return;
                button.addEventListener('click', () => revealFieldFromShortcut(button.dataset.revealField));
                button.dataset.revealBound = '1';
            });

            ensureRouteStopsReady();
            const addRouteStopButton = document.getElementById('addRouteStopBtn');
            if (addRouteStopButton && addRouteStopButton.dataset.routeStopBound !== '1') {
                addRouteStopButton.addEventListener('click', () => {
                    addRouteStop('', true);
                    updateFare();
                });
                addRouteStopButton.dataset.routeStopBound = '1';
            }

            document.querySelectorAll('[data-mode-shortcut]').forEach((button) => {
                if (button.dataset.modeBound === '1') return;
                button.addEventListener('click', () => {
                    setCabBookingMode(button.dataset.modeShortcut || 'airport');
                    document.getElementById('cabBookingConsole')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                button.dataset.modeBound = '1';
            });

            document.querySelectorAll('input[name="journeyMode"]').forEach((radio) => {
                if (radio.dataset.journeyBound === '1') return;
                radio.addEventListener('change', () => {
                    if (radio.checked) setCabJourneyMode(radio.value, { syncReturnTrip: radio.value !== 'one_way' });
                });
                radio.dataset.journeyBound = '1';
            });

            const tripPlanNode = document.getElementById('tripPlan');
            if (tripPlanNode && tripPlanNode.dataset.cabModeBound !== '1') {
                tripPlanNode.addEventListener('change', () => {
                    setCabBookingMode(inferCabFlowFromTripPlan(tripPlanNode.value), {
                        syncTripPlan: false,
                        skipFare: true
                    });
                });
                tripPlanNode.dataset.cabModeBound = '1';
            }

            const searchButton = document.getElementById('cabPrimarySearch');
            if (searchButton && searchButton.dataset.cabBound !== '1') {
                searchButton.addEventListener('pointerdown', (event) => {
                    if (event.button && event.button !== 0) return;
                    searchButton.dataset.cabPointerHandled = '1';
                    window.setTimeout(() => {
                        delete searchButton.dataset.cabPointerHandled;
                    }, 350);
                    event.preventDefault();
                    handleCabPrimarySearch();
                }, true);
                searchButton.addEventListener('click', (event) => {
                    if (searchButton.dataset.cabPointerHandled === '1') {
                        delete searchButton.dataset.cabPointerHandled;
                        event.preventDefault();
                        return;
                    }
                    handleCabPrimarySearch();
                });
                searchButton.dataset.cabBound = '1';
            }

            const backButton = document.getElementById('cabStepBackBtn');
            if (backButton && backButton.dataset.cabBound !== '1') {
                const handleBackButtonAction = () => {
                    closeAllBookingAutocompleteBoxes();
                    handleCabStepBack();
                };
                backButton.addEventListener('pointerdown', (event) => {
                    if (event.button && event.button !== 0) return;
                    backButton.dataset.cabPointerHandled = '1';
                    window.setTimeout(() => {
                        delete backButton.dataset.cabPointerHandled;
                    }, 350);
                    event.preventDefault();
                    handleBackButtonAction();
                }, true);
                backButton.addEventListener('click', (event) => {
                    if (backButton.dataset.cabPointerHandled === '1') {
                        delete backButton.dataset.cabPointerHandled;
                        event.preventDefault();
                        return;
                    }
                    handleBackButtonAction();
                });
                backButton.dataset.cabBound = '1';
            }

            const pickupMini = document.getElementById('cabQuickPickupInput');
            const dropoffMini = document.getElementById('cabQuickDropoffInput');
            const terminalMini = document.getElementById('cabQuickTerminalInput');
            const dateMini = document.getElementById('cabQuickDateInput');
            const timeMini = document.getElementById('cabQuickTimeInput');
            const returnDateMini = document.getElementById('cabQuickReturnDateInput');
            const returnTimeMini = document.getElementById('cabQuickReturnTimeInput');
            const packageMini = document.getElementById('cabQuickPackageSelect');

            const bindMiniLocation = (miniNode, targetId, layerKey) => {
                if (!miniNode || miniNode.dataset.cabMiniBound === '1') return;
                miniNode.addEventListener('input', (event) => {
                    const target = document.getElementById(targetId);
                    if (target) target.value = miniNode.value;
                    showQuickLocationSuggestions(miniNode, event);
                    if (target) target.value = miniNode.value;
                    updateBookingExperience();
                });
                ['change', 'blur'].forEach((eventName) => {
                    miniNode.addEventListener(eventName, () => {
                        const committedSelection = miniNode.dataset.cabCommittedSelection === '1';
                        delete miniNode.dataset.cabCommittedSelection;
                        const target = document.getElementById(targetId);
                        if (target) target.value = miniNode.value;
                        handleLocationUpdated();
                        if (eventName === 'change' && committedSelection && layerKey) {
                            advanceCabLayerIfCurrentComplete(layerKey);
                        }
                    });
                });
                miniNode.dataset.cabMiniBound = '1';
            };

            bindMiniLocation(pickupMini, 'pickup', 'pickup');
            bindMiniLocation(dropoffMini, 'dropoff', 'dropoff');

            if (terminalMini && terminalMini.dataset.cabMiniBound !== '1') {
                terminalMini.addEventListener('input', () => {
                    updateBookingExperience();
                });
                terminalMini.addEventListener('change', () => {
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('terminal');
                });
                terminalMini.dataset.cabMiniBound = '1';
            }

            const bindQuickAutocomplete = (attempt = 0) => {
                if (typeof initializeAutocomplete === 'function') {
                    patchBookingLocationAutocompletePositioner();
                    initializeAutocomplete('pickup');
                    initializeAutocomplete('dropoff');
                    initializeAutocomplete('cabQuickPickupInput');
                    initializeAutocomplete('cabQuickDropoffInput');
                    getRouteStopInputs().forEach((input) => initializeAutocomplete(input.id));
                    ['pickup', 'dropoff', 'cabQuickPickupInput', 'cabQuickDropoffInput'].forEach(bindAirportOnlyAutocomplete);
                    return true;
                }
                if (attempt < 80) {
                    window.setTimeout(() => bindQuickAutocomplete(attempt + 1), 250);
                }
                return false;
            };
            bindQuickAutocomplete();
            window.addEventListener('load', () => bindQuickAutocomplete(0), { once: true });

            if (dateMini && dateMini.dataset.cabMiniBound !== '1') {
                dateMini.addEventListener('change', () => {
                    const rideDateNode = document.getElementById('rideDate');
                    if (rideDateNode) rideDateNode.value = dateMini.value;
                    syncBookingDateTimeLimits();
                    toggleReturnTrip();
                    syncCabRoundTripUi(getActiveCabFlow());
                    updateFare();
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('date');
                });
                dateMini.dataset.cabMiniBound = '1';
            }

            if (timeMini && timeMini.dataset.cabMiniBound !== '1') {
                timeMini.addEventListener('change', () => {
                    const rideTimeNode = document.getElementById('rideTime');
                    if (rideTimeNode) rideTimeNode.value = timeMini.value;
                    syncBookingDateTimeLimits();
                    toggleReturnTrip();
                    syncCabRoundTripUi(getActiveCabFlow());
                    updateFare();
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('time');
                });
                timeMini.dataset.cabMiniBound = '1';
            }

            if (returnDateMini && returnDateMini.dataset.cabMiniBound !== '1') {
                returnDateMini.addEventListener('change', () => {
                    const returnDateNode = document.getElementById('returnDate');
                    if (returnDateNode) returnDateNode.value = returnDateMini.value;
                    syncBookingDateTimeLimits();
                    syncCabRoundTripUi(getActiveCabFlow());
                    updateFare();
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('returnDate');
                });
                returnDateMini.dataset.cabMiniBound = '1';
            }

            if (returnTimeMini && returnTimeMini.dataset.cabMiniBound !== '1') {
                returnTimeMini.addEventListener('change', () => {
                    const returnTimeNode = document.getElementById('returnTime');
                    if (returnTimeNode) returnTimeNode.value = returnTimeMini.value;
                    syncBookingDateTimeLimits();
                    syncCabRoundTripUi(getActiveCabFlow());
                    updateFare();
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('returnTime');
                });
                returnTimeMini.dataset.cabMiniBound = '1';
            }

            if (packageMini && packageMini.dataset.cabMiniBound !== '1') {
                packageMini.addEventListener('change', () => {
                    if (getActiveCabFlow() === 'airport' && isAirportPackageMode()) {
                        syncPackageSelectOptions('airport');
                        updateFare();
                        updateBookingExperience();
                    } else {
                        applyCabPackageValue(packageMini.value);
                    }
                    advanceCabLayerIfCurrentComplete('package');
                });
                packageMini.dataset.cabMiniBound = '1';
            }

            setCabBookingMode(getActiveCabFlow(), { syncTripPlan: false, skipFare: true });
            if (getActiveCabFlow() === 'airport') {
                setAirportServiceMode(getAirportServiceMode(), { skipFare: true });
            } else {
                setCabJourneyMode(document.querySelector('input[name="journeyMode"]:checked')?.value || 'one_way', {
                    syncReturnTrip: false,
                    skipFare: true
                });
            }
            syncCabMiniFare(latestFareEstimate || createAwaitingFareEstimate(readFareEstimateInputs()));
        }

        function formatCurrency(amount) {
            return `₹${Math.max(0, Math.round(Number(amount) || 0))}`;
        }

        function parseCurrencyValue(value) {
            const numeric = Number(String(value || '').replace(/[^0-9.-]/g, ''));
            return Number.isFinite(numeric) ? Math.round(numeric) : 0;
        }

        function setPromoStatus(message, type = '') {
            const statusNode = document.getElementById('promoStatus');
            if (!statusNode) return;

            statusNode.textContent = message || '';
            statusNode.classList.remove('success', 'error');
            if (type) {
                statusNode.classList.add(type);
            }
        }

        function applyPromoCode() {
            const promoInput = document.getElementById('promoCode');
            if (!promoInput) return;

            const code = sanitizeInput(promoInput.value).trim().toUpperCase();
            if (!code) {
                appliedPromo = null;
                setPromoStatus('Promo cleared');
                updateFare();
                return;
            }

            const promo = PROMO_OFFERS[code];
            if (!promo) {
                appliedPromo = null;
                setPromoStatus('Invalid promo code. Try RIDE50, SAVE10, AIRPORT100 or GLOBAL15', 'error');
                updateFare();
                return;
            }

            appliedPromo = { code, ...promo };
            setPromoStatus(`Applied ${code}: ${promo.description}`, 'success');
            updateFare();
        }

        function toggleReturnTrip() {
            const toggleNode = document.getElementById('isReturnTrip');
            const fieldsNode = document.getElementById('returnTripFields');
            const returnDateNode = document.getElementById('returnDate');
            const returnTimeNode = document.getElementById('returnTime');
            const rideDateNode = document.getElementById('rideDate');
            const rideTimeNode = document.getElementById('rideTime');

            if (!toggleNode || !fieldsNode || !returnDateNode || !returnTimeNode) return;

            if (toggleNode.checked) {
                fieldsNode.style.display = 'grid';
                returnDateNode.required = true;
                returnTimeNode.required = true;
                const rideDateValue = rideDateNode?.value || '';
                if (rideDateValue) {
                    returnDateNode.min = rideDateValue;
                }
                if (rideDateValue && returnDateNode.value && returnDateNode.value < rideDateValue) {
                    returnDateNode.value = '';
                }
            } else {
                fieldsNode.style.display = 'none';
                returnDateNode.required = false;
                returnTimeNode.required = false;
                returnDateNode.value = '';
                returnTimeNode.value = '';
                returnDateNode.min = '';
            }
            syncCabRoundTripUi(getActiveCabFlow());
        }

        function calculatePromoDiscount(grossTotal, tripPlan, paymentMethod) {
            if (!appliedPromo) return 0;

            if (appliedPromo.tripPlan && appliedPromo.tripPlan !== tripPlan) {
                return 0;
            }

            if (Array.isArray(appliedPromo.paymentMethods) && !appliedPromo.paymentMethods.includes(paymentMethod)) {
                return 0;
            }

            let discount = 0;
            if (appliedPromo.type === 'flat') {
                discount = appliedPromo.value;
            } else if (appliedPromo.type === 'percent') {
                discount = Math.round(grossTotal * (appliedPromo.value / 100));
            }

            if (appliedPromo.max) {
                discount = Math.min(discount, appliedPromo.max);
            }

            return Math.max(0, Math.min(discount, grossTotal));
        }

        const BOOKING_STEP_SHORT_LABELS = {
            'location': 'Location',
            'when': 'When',
            'trip plan & payment': 'Trip & Pay',
            'travel assurance': 'Assurance',
            'ride type *': 'Ride Type',
            'passenger details': 'Passengers',
            'special requests': 'Requests',
            'route add-ons': 'Route',
            'safety & accessibility': 'Safety',
            'additional notes': 'Notes'
        };

        const BOOKING_STEP_KEY_BY_LABEL = {
            'location': 'location',
            'when': 'when',
            'trip plan & payment': 'trip',
            'travel assurance': 'assurance',
            'ride type *': 'ride',
            'passenger details': 'passengers',
            'special requests': 'requests',
            'route add-ons': 'route',
            'safety & accessibility': 'safety',
            'additional notes': 'notes'
        };

        const SERVICE_FOLDER_STEPS = {
            airport: ['assurance', 'trip', 'ride', 'passengers', 'requests', 'safety', 'notes'],
            local: ['assurance', 'trip', 'ride', 'passengers', 'requests', 'safety', 'notes'],
            outstation: ['assurance', 'trip', 'ride', 'passengers', 'requests', 'safety', 'notes'],
            day_trips: ['assurance', 'trip', 'ride', 'passengers', 'requests', 'safety', 'notes']
        };

        const SERVICE_FOLDER_NOTES = {
            airport: {
                location: 'Airport booking ke liye pickup aur airport/drop location fill karein.',
                when: 'Flight ya pickup schedule ke hisaab se future date and time choose karein.',
                trip: 'Airport transfer, payment mode, coupon and required contact number yahin manage hota hai.',
                assurance: 'Flight number, meet-and-greet, wait buffer, GST invoice and cancellation/reschedule preference yahin save hota hai.',
                ride: 'Airport luggage aur comfort ke hisaab se vehicle segment select karein.',
                passengers: 'Passenger and luggage details se fare estimate accurate hota hai.',
                requests: 'Meet and greet, AC, charger, WiFi jaise airport comfort options yahin select karein.',
                safety: 'Live sharing, masked calling, child seat and accessibility options add karein.',
                notes: 'Flight number, terminal, gate, or pickup instruction yahan likh sakte hain.'
            },
            local: {
                location: 'Local cab ke liye pickup aur drop location fill karein.',
                when: 'City ride pickup ke liye future date and time choose karein.',
                trip: 'Local cab service, payment mode, coupon and required contact number yahin manage hota hai.',
                assurance: 'City pickup ke liye driver call, wait buffer, invoice and reschedule/cancel preference set karein.',
                ride: 'City ride ke liye hatchback, sedan, SUV ya premium vehicle choose karein.',
                passengers: 'Passenger and luggage details local cab ke liye set karein.',
                requests: 'City travel comfort options choose karein.',
                safety: 'Live sharing, masked calling and safety preferences add karein.',
                notes: 'Pickup note, waiting instruction ya local route detail yahan likhein.'
            },
            outstation: {
                location: 'Outstation ke liye pickup city aur destination city/location fill karein.',
                when: 'Outstation journey start time future me hona chahiye.',
                trip: 'One way, round trip, budget, payment, coupon and required contact number yahin set hota hai.',
                assurance: 'Outstation trip ke liye wait buffer, invoice, roof carrier, driver call and reschedule/cancel preference set karein.',
                ride: 'Long-route comfort ke liye sedan, SUV, traveller, coach ya premium segment select karein.',
                passengers: 'Passenger count and luggage route planning ke liye important hai.',
                route: 'Outstation me add stops, return route and intermediate city planning yahin rahega.',
                requests: 'Long drive comfort options choose karein.',
                safety: 'Verified driver, live trip share and accessibility options yahin choose karein.',
                notes: 'Highway stop, hotel pickup, waiting, toll preference ya driver instruction yahan likhein.'
            },
            day_trips: {
                location: 'Day plan ke liye pickup city/location fill karein. Drop city optional package flow me handle hota hai.',
                when: 'Day plan start date and time choose karein.',
                trip: 'Day package, city service, payment, coupon and required contact number yahin set hota hai.',
                assurance: 'Day plan me waiting buffer, driver call, GST invoice and reschedule/cancel preference yahin save hota hai.',
                ride: 'City rental ke liye hatchback, sedan, SUV ya premium vehicle choose karein.',
                passengers: 'Passenger and luggage details city package ke liye set karein.',
                route: 'Day plan me multi-stop city route yahin add karein.',
                requests: 'City travel comfort options select karein.',
                safety: 'Live sharing, masked calling and safety preferences add karein.',
                notes: 'Meeting stops, waiting instruction, office route or local sightseeing notes yahan likhein.'
            }
        };

        const SERVICE_FOLDER_PROGRESS = {
            airport: 0,
            local: 0,
            outstation: 0,
            day_trips: 0
        };

        function resetServiceFolderProgress(flow = getActiveCabFlow()) {
            const safeFlow = SERVICE_FOLDER_PROGRESS[flow] === undefined ? 'airport' : flow;
            SERVICE_FOLDER_PROGRESS[safeFlow] = 0;
        }

        function getServiceFolderProgressIndex(flow = getActiveCabFlow(), sections = getServiceVisibleSections(flow)) {
            const safeFlow = SERVICE_FOLDER_PROGRESS[flow] === undefined ? 'airport' : flow;
            const maxIndex = Math.max(0, (Array.isArray(sections) ? sections.length : 0) - 1);
            const current = Number(SERVICE_FOLDER_PROGRESS[safeFlow] || 0);
            return Math.max(0, Math.min(current, maxIndex));
        }

        function setServiceFolderProgressIndex(flow = getActiveCabFlow(), index = 0, sections = getServiceVisibleSections(flow)) {
            const safeFlow = SERVICE_FOLDER_PROGRESS[flow] === undefined ? 'airport' : flow;
            const maxIndex = Math.max(0, (Array.isArray(sections) ? sections.length : 0) - 1);
            SERVICE_FOLDER_PROGRESS[safeFlow] = Math.max(0, Math.min(Number(index || 0), maxIndex));
            return SERVICE_FOLDER_PROGRESS[safeFlow];
        }

        function getCompactAccordionLabel(label) {
            const key = normalizeAccordionLabel(label)
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            return BOOKING_STEP_SHORT_LABELS[key] || label;
        }

        function getSectionStepKey(section) {
            const title = normalizeAccordionLabel(section?.dataset?.sectionTitle || '', '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            return BOOKING_STEP_KEY_BY_LABEL[title] || section?.dataset?.stepKey || '';
        }

        function getServiceStepKeys(flow = getActiveCabFlow()) {
            return SERVICE_FOLDER_STEPS[flow] || SERVICE_FOLDER_STEPS.airport;
        }

        function getAllAccordionSections() {
            return Array.from(document.querySelectorAll('#bookingForm > .form-section.pro-collapsible'));
        }

        function getServiceVisibleSections(flow = getActiveCabFlow()) {
            const stepKeys = getServiceStepKeys(flow);
            const allowed = new Set(stepKeys);
            const stepOrder = new Map(stepKeys.map((key, index) => [key, index]));
            return getAllAccordionSections()
                .filter((section) => allowed.has(section.dataset.stepKey || getSectionStepKey(section)))
                .sort((a, b) => {
                    const aKey = a.dataset.stepKey || getSectionStepKey(a);
                    const bKey = b.dataset.stepKey || getSectionStepKey(b);
                    return (stepOrder.get(aKey) ?? 999) - (stepOrder.get(bKey) ?? 999);
                });
        }

        function isBookingStepComplete(stepKey, flow = getActiveCabFlow()) {
            const hasValue = (id) => String(document.getElementById(id)?.value || '').trim().length > 0;
            if (stepKey === 'location') {
                if (flow === 'day_trips') return hasValue('pickup');
                return hasValue('pickup') && hasValue('dropoff');
            }
            if (stepKey === 'when') return hasValue('rideDate') && hasValue('rideTime');
            if (stepKey === 'trip') return hasValue('tripPlan') && hasValue('paymentMethod');
            if (stepKey === 'ride') return Boolean(document.querySelector('input[name="rideType"]:checked')) && hasValue('vehicleModel');
            if (stepKey === 'passengers') return hasValue('passengers') && hasValue('luggage');
            return true;
        }

        function getUnlockedServiceStepIndex(sections, flow = getActiveCabFlow()) {
            if (!sections.length) return -1;
            const firstIncomplete = sections.findIndex((section) => !isBookingStepComplete(section.dataset.stepKey, flow));
            if (firstIncomplete === -1) return sections.length - 1;
            return Math.min(sections.length - 1, firstIncomplete);
        }

        function ensureServiceFolderNote(section, flow = getActiveCabFlow()) {
            if (!section) return;
            const body = section.querySelector(':scope > .form-section-body');
            if (!body) return;
            let note = body.querySelector(':scope > .service-folder-note');
            if (!note) {
                note = document.createElement('div');
                note.className = 'service-folder-note';
                note.innerHTML = '<i class="fas fa-folder-open"></i><span></span>';
                body.insertBefore(note, body.firstChild);
            }
            const noteText = SERVICE_FOLDER_NOTES[flow]?.[section.dataset.stepKey] || 'Is folder ko complete karke next step par jaayein.';
            const textNode = note.querySelector('span');
            if (textNode) textNode.textContent = noteText;
        }

        function ensureServiceFolderActions(section) {
            if (!section) return;
            const body = section.querySelector(':scope > .form-section-body');
            if (!body || body.querySelector(':scope > .service-folder-actions')) return;
            const actions = document.createElement('div');
            actions.className = 'service-folder-actions';
            actions.innerHTML = `
                <button type="button" class="service-folder-prev"><i class="fas fa-arrow-left"></i> Back</button>
                <button type="button" class="service-folder-next">Continue <i class="fas fa-arrow-right"></i></button>
            `;
            body.appendChild(actions);
            actions.querySelector('.service-folder-prev')?.addEventListener('click', () => moveServiceFolder(section, -1));
            actions.querySelector('.service-folder-next')?.addEventListener('click', () => moveServiceFolder(section, 1));
        }

        function moveServiceFolder(currentSection, direction) {
            const flow = getActiveCabFlow();
            const sections = getServiceVisibleSections(flow);
            const currentIndex = sections.indexOf(currentSection);
            if (currentIndex === -1) return;

            const nextIndex = currentIndex + direction;
            if (nextIndex < 0) return;
            if (nextIndex >= sections.length) {
                document.querySelector('.summary-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }

            const currentProgress = getServiceFolderProgressIndex(flow, sections);
            if (direction > 0 && nextIndex > currentProgress) {
                setServiceFolderProgressIndex(flow, nextIndex, sections);
            }

            const targetIndex = direction > 0
                ? Math.max(nextIndex, getServiceFolderProgressIndex(flow, sections))
                : nextIndex;
            setActiveAccordionSection(sections, sections[Math.max(0, Math.min(targetIndex, sections.length - 1))]);
            syncServiceFolderVisibility(flow);
        }

        function setSectionExpanded(section, expanded) {
            if (!section) return;
            section.classList.toggle('is-collapsed', !expanded);
            const trigger = section.querySelector(':scope > .section-toggle-btn');
            if (trigger) {
                trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            }
        }

        function normalizeAccordionLabel(value, fallback = 'Section') {
            const text = String(value || '').replace(/\s+/g, ' ').trim();
            return text || fallback;
        }

        function syncAccordionSelectorState(activeSection) {
            return;
        }

        function setActiveAccordionSection(sections, activeSection) {
            if (!Array.isArray(sections) || !sections.length || !activeSection) return;
            sections.forEach((section) => {
                const isVisible = !section.classList.contains('is-service-hidden');
                setSectionExpanded(section, isVisible && section === activeSection);
            });
            syncAccordionSelectorState(activeSection);
        }

        function revealBookingField(fieldId) {
            const field = document.getElementById(fieldId);
            if (!field) return;

            const drawer = document.getElementById('advancedBookingDrawer');
            if (document.body) {
                document.body.classList.add('booking-advanced-ready');
            }
            if (drawer) drawer.open = true;

            const section = field.closest('.form-section.pro-collapsible');
            if (section) {
                const flow = getActiveCabFlow();
                const sections = getServiceVisibleSections(flow);
                const sectionIndex = sections.indexOf(section);
                if (sectionIndex >= 0) {
                    setServiceFolderProgressIndex(flow, sectionIndex, sections);
                }
                if (!section.classList.contains('is-service-hidden')) {
                    setActiveAccordionSection(sections, section);
                }
            }

            window.setTimeout(() => {
                if (typeof field.focus === 'function') {
                    field.focus({ preventScroll: true });
                }
            }, 60);
        }

        function ensureAccordionSelector(sections) {
            const selector = document.getElementById('bookingSectionSelector');
            if (selector) selector.remove();
        }

        function syncServiceFolderVisibility(flow = getActiveCabFlow()) {
            const allSections = getAllAccordionSections();
            if (!allSections.length) return;

            const allowedSteps = new Set(getServiceStepKeys(flow));
            allSections.forEach((section) => {
                const stepKey = section.dataset.stepKey || getSectionStepKey(section);
                const isAllowed = allowedSteps.has(stepKey);
                section.classList.toggle('is-service-hidden', !isAllowed);
                if (!isAllowed) {
                    setSectionExpanded(section, false);
                }
            });

            const visibleSections = getServiceVisibleSections(flow);
            if (!visibleSections.length) return;
            ensureAccordionSelector(visibleSections);

            const unlockedIndex = getServiceFolderProgressIndex(flow, visibleSections);
            let activeSection = visibleSections.find((section) => !section.classList.contains('is-collapsed'));
            const activeIndex = visibleSections.indexOf(activeSection);
            if (!activeSection || activeIndex === -1 || activeIndex > unlockedIndex) {
                activeSection = visibleSections[Math.min(unlockedIndex, visibleSections.length - 1)];
            }

            visibleSections.forEach((section) => {
                section.classList.toggle('is-step-hidden', section !== activeSection);
            });

            visibleSections.forEach((section, index) => {
                const stepComplete = isBookingStepComplete(section.dataset.stepKey, flow);
                const isLocked = index > unlockedIndex;
                section.classList.toggle('is-step-locked', isLocked);
                section.dataset.serviceUnlocked = isLocked ? '0' : '1';
                section.dataset.serviceComplete = stepComplete ? '1' : '0';
                ensureServiceFolderNote(section, flow);
                ensureServiceFolderActions(section);

                const prevButton = section.querySelector('.service-folder-prev');
                const nextButton = section.querySelector('.service-folder-next');
                if (prevButton) prevButton.disabled = index === 0;
                if (nextButton) {
                    nextButton.disabled = isLocked;
                    nextButton.innerHTML = index === visibleSections.length - 1
                        ? 'Review Fare <i class="fas fa-receipt"></i>'
                        : 'Continue <i class="fas fa-arrow-right"></i>';
                }
            });

            setActiveAccordionSection(visibleSections, activeSection);
        }

        function initFormAccordion() {
            const sections = Array.from(document.querySelectorAll('#bookingForm > .form-section'));
            if (!sections.length) return;
            sections.forEach((section, index) => {
                const sectionId = section.id || `booking-step-${index + 1}`;
                if (!section.id) section.id = sectionId;
                section.dataset.sectionId = section.id;

                if (section.dataset.proAccordionInit === '1') {
                    if (!section.dataset.sectionTitle) {
                        const existingLabel = section.querySelector(':scope > .section-toggle-btn span');
                        section.dataset.sectionTitle = normalizeAccordionLabel(existingLabel?.textContent, `Step ${index + 1}`);
                        section.dataset.stepKey = getSectionStepKey(section);
                    }
                    return;
                }

                const heading = section.querySelector(':scope > h3');
                if (!heading) return;
                section.dataset.sectionTitle = normalizeAccordionLabel(heading.textContent, `Step ${index + 1}`);
                section.dataset.stepKey = getSectionStepKey(section);

                const body = document.createElement('div');
                body.className = 'form-section-body';

                const children = Array.from(section.children);
                let move = false;
                children.forEach((node) => {
                    if (node === heading) {
                        move = true;
                        return;
                    }
                    if (move) {
                        body.appendChild(node);
                    }
                });

                const trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'section-toggle-btn';
                trigger.innerHTML = `<span>${heading.innerHTML}</span><i class="fas fa-chevron-down"></i>`;

                section.classList.add('pro-collapsible');
                section.insertBefore(trigger, section.firstChild);
                section.appendChild(body);
                heading.remove();

                const shouldOpen = index === 0;
                setSectionExpanded(section, shouldOpen);

                trigger.addEventListener('click', () => {
                    if (section.classList.contains('is-step-locked')) return;
                    setActiveAccordionSection(getServiceVisibleSections(), section);
                    syncServiceFolderVisibility(getActiveCabFlow());
                });

                section.dataset.proAccordionInit = '1';
            });

            syncServiceFolderVisibility(getActiveCabFlow());

            const form = document.getElementById('bookingForm');
            if (form && !form.dataset.proFocusBound) {
                form.addEventListener('focusin', (event) => {
                    const isToggleTrigger = event.target && event.target.closest && event.target.closest('.section-toggle-btn');
                    if (isToggleTrigger) return;
                    const hostSection = event.target.closest('.form-section.pro-collapsible');
                    if (hostSection && !hostSection.classList.contains('is-service-hidden') && !hostSection.classList.contains('is-step-locked') && hostSection.classList.contains('is-collapsed')) {
                        setActiveAccordionSection(getServiceVisibleSections(), hostSection);
                    } else if (hostSection) {
                        syncAccordionSelectorState(hostSection);
                    }
                });
                form.dataset.proFocusBound = '1';
            }
        }

        function initTripFlowControls() {
            const pillHost = document.getElementById('tripFlowPills');
            const hiddenNode = document.getElementById('tripFlow');
            if (!pillHost || !hiddenNode || pillHost.dataset.bound === '1') return;

            pillHost.addEventListener('click', (event) => {
                const target = event.target.closest('.trip-flow-pill');
                if (!target) return;

                setCabBookingMode(target.dataset.flow || 'airport');
            });

            pillHost.dataset.bound = '1';
        }

        function updateFormProgress() {
            const trackers = [
                () => String(document.getElementById('pickup')?.value || '').trim().length > 2,
                () => String(document.getElementById('dropoff')?.value || '').trim().length > 2,
                () => Boolean(document.getElementById('rideDate')?.value),
                () => Boolean(document.getElementById('rideTime')?.value),
                () => Boolean(document.querySelector('input[name=\"rideType\"]:checked')),
                () => Boolean(document.getElementById('vehicleModel')?.value),
                () => Boolean(document.getElementById('tripPlan')?.value),
                () => Boolean(document.getElementById('paymentMethod')?.value),
                () => Boolean(document.getElementById('passengers')?.value),
                () => Boolean(document.getElementById('luggage')?.value)
            ];

            const completed = trackers.reduce((acc, test) => acc + (test() ? 1 : 0), 0);
            const percent = Math.max(8, Math.round((completed / trackers.length) * 100));

            const fillNode = document.getElementById('bookingProgressFill');
            const textNode = document.getElementById('bookingProgressText');
            if (fillNode) fillNode.style.width = `${percent}%`;
            if (textNode) textNode.textContent = `${percent}% complete`;
        }

        function updateBookingExperience() {
            const currentFlow = getActiveCabFlow();
            const flowConfig = getCabFlowConfig(currentFlow);
            const chipsNode = document.getElementById('bookingContextChips');
            if (chipsNode) {
                const journeyMode = String(document.querySelector('input[name=\"journeyMode\"]:checked')?.value || 'one_way')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (char) => char.toUpperCase());
                const modelNode = document.getElementById('vehicleModel');
                const selectedModel = modelNode ? modelNode.options[modelNode.selectedIndex]?.text : '';
                const fuelNode = document.getElementById('vehicleFuelPreference');
                const selectedFuel = fuelNode ? fuelNode.options[fuelNode.selectedIndex]?.text : '';
                const budget = Number.parseFloat(document.getElementById('budgetAmount')?.value || 0);

                const items = [
                    `<span class=\"context-chip\"><i class=\"fas fa-route\"></i> ${flowConfig.shortLabel}</span>`,
                    `<span class=\"context-chip\"><i class=\"fas fa-map-signs\"></i> ${journeyMode}</span>`
                ];

                if (selectedModel) {
                    items.push(`<span class=\"context-chip\"><i class=\"fas fa-car-side\"></i> ${selectedModel}</span>`);
                }

                if (selectedFuel && fuelNode?.value && fuelNode.value !== 'no_preference') {
                    items.push(`<span class=\"context-chip\"><i class=\"fas fa-gas-pump\"></i> ${selectedFuel}</span>`);
                }

                if (budget > 0) {
                    items.push(`<span class=\"context-chip\"><i class=\"fas fa-wallet\"></i> Budget ${formatCurrency(budget)}</span>`);
                }

                chipsNode.innerHTML = items.join('');
            }

            syncCabModeUi(currentFlow);
            updateFormProgress();
            syncServiceFolderVisibility(currentFlow);
            updateRoutePreview();
        }

        function bindProfessionalInputs() {
            const watchIds = [
                'pickup', 'dropoff', 'rideDate', 'rideTime', 'returnDate', 'returnTime',
                'tripPlan', 'paymentMethod', 'tripServiceType', 'budgetAmount',
                'vehicleModel', 'preferredDriverType', 'vehicleFuelPreference', 'passengers', 'luggage',
                'isReturnTrip', 'promoCode'
            ];

            watchIds.forEach((id) => {
                const node = document.getElementById(id);
                if (!node || node.dataset.proBound === '1') return;

                const eventName = (node.tagName === 'INPUT' && String(node.type).toLowerCase() === 'text') || node.tagName === 'TEXTAREA'
                    ? 'input'
                    : 'change';

                node.addEventListener(eventName, updateBookingExperience);
                if (eventName !== 'change') {
                    node.addEventListener('change', updateBookingExperience);
                }
                node.dataset.proBound = '1';
            });

            document.querySelectorAll('input[name="rideType"], input[name="journeyMode"]').forEach((node) => {
                if (node.dataset.proBound === '1') return;
                node.addEventListener('change', updateBookingExperience);
                node.dataset.proBound = '1';
            });
        }

        function initProfessionalBookingUI() {
            initFormAccordion();
            mountAdvancedDrawerInline();
            initTripFlowControls();
            bindProfessionalInputs();
            initInternationalCabBookingUI();
            updateBookingExperience();
            initBookingBackGuard();
            initGoogleMapBookingUI();
        }

        window.addEventListener('load', function() {
            currentUser = checkAuth();
            if (!currentUser) return;
            resolveCurrentCustomerEmail();
            resolveCurrentCustomerPhoneMeta();
            hydrateBookingPhoneVerificationUI();

            seedDefaultBookingDateTime();

            const promoInput = document.getElementById('promoCode');
            if (promoInput) {
                promoInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        applyPromoCode();
                    }
                });
            }

            toggleReturnTrip();
            document.getElementById('rideDate').addEventListener('change', () => {
                syncBookingDateTimeLimits();
                toggleReturnTrip();
                updateFare();
            });
            document.getElementById('rideTime').addEventListener('change', () => {
                syncBookingDateTimeLimits();
                toggleReturnTrip();
                updateFare();
            });
            document.getElementById('returnDate').addEventListener('change', () => {
                syncBookingDateTimeLimits();
                updateFare();
            });
            document.getElementById('returnTime').addEventListener('change', () => {
                syncBookingDateTimeLimits();
                updateFare();
            });
            const bookingForm = document.getElementById('bookingForm');
            if (bookingForm && bookingForm.dataset.submitGuardBound !== '1') {
                const hasInlineSubmitHandler = typeof bookingForm.onsubmit === 'function' || !!bookingForm.getAttribute('onsubmit');
                if (!hasInlineSubmitHandler) {
                    bookingForm.addEventListener('submit', handleBookingFormSubmit);
                }
                bookingForm.dataset.submitGuardBound = '1';
            }

            updateFare();
            updateDistanceEstimate();
            initProfessionalBookingUI();
            warmBookingBackendConnections();
            setTimeout(() => {
                flushAdminEmailRetryQueue({ silent: true });
                if (!adminEmailRetryIntervalRef) {
                    adminEmailRetryIntervalRef = setInterval(() => {
                        flushAdminEmailRetryQueue({ silent: true });
                    }, 25000);
                }
            }, 2500);

            window.addEventListener('online', () => {
                clearAdminEmailCooldown();
                flushAdminEmailRetryQueue({ silent: true });
            });

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    flushAdminEmailRetryQueue({ silent: true });
                }
            });
        });

        // ============================================
        // FARE CALCULATION
        // ============================================

        function getFareCalculator() {
            if (window.GoIndiaRideFareCalculator && typeof window.GoIndiaRideFareCalculator.estimateBookingFare === 'function') {
                return window.GoIndiaRideFareCalculator;
            }
            return null;
        }

        function readTravelAssuranceDetails() {
            const readValue = (id, limit = 180) => sanitizeInput(document.getElementById(id)?.value || '', limit).trim();
            const readChecked = (id) => Boolean(document.getElementById(id)?.checked);
            return {
                flightDetails: {
                    flightNumber: readValue('flightNumber', 40).toUpperCase(),
                    airlineName: readValue('airlineName', 120),
                    meetAndGreetName: readValue('meetAndGreetName', 140),
                    useFlightDelayNotes: readChecked('airportFlightTrackingConsent')
                },
                policyPreferences: {
                    waitingBuffer: readValue('waitingBuffer', 60) || 'airport_30',
                    rescheduleWindow: readValue('rescheduleWindow', 80) || 'standard_policy',
                    cancellationPreference: readValue('cancellationPreference', 80) || 'standard_policy',
                    driverCallPreference: readValue('driverCallPreference', 80) || 'call_30_min_before',
                    driverCallBeforeArrival: readChecked('driverCallBeforeArrival'),
                    extraWaitApproval: readChecked('extraWaitApproval')
                },
                billingDetails: {
                    gstInvoiceRequired: readChecked('gstInvoiceRequired'),
                    gstCompanyName: readValue('gstCompanyName', 160),
                    gstNumber: readValue('gstNumber', 40).toUpperCase()
                },
                addOns: {
                    roofCarrierNeeded: readChecked('roofCarrierNeeded'),
                    newVehicleGuarantee: readChecked('newVehicleGuarantee')
                }
            };
        }

        function readFareEstimateInputs() {
            const routeStops = readRouteStops();
            const travelAssurance = readTravelAssuranceDetails();
            const locationPins = buildBookingLocationSnapshot();

            return {
                pickup: sanitizeInput(document.getElementById('pickup').value).trim(),
                drop: sanitizeInput(document.getElementById('dropoff').value).trim(),
                pickupCoordinates: locationPins.pickup.coordinates,
                dropoffCoordinates: locationPins.dropoff.coordinates,
                routeStopLocations: locationPins.stops,
                locationPins,
                rideDate: document.getElementById('rideDate').value,
                rideTime: document.getElementById('rideTime').value,
                returnDate: document.getElementById('returnDate').value,
                returnTime: document.getElementById('returnTime').value,
                isReturnTrip: document.getElementById('isReturnTrip').checked,
                rideType: document.querySelector('input[name="rideType"]:checked')?.value || 'economy',
                vehicleType: document.querySelector('input[name="rideType"]:checked')?.value || 'economy',
                vehicleModel: document.getElementById('vehicleModel').value,
                vehicleFuelPreference: document.getElementById('vehicleFuelPreference')?.value || 'no_preference',
                tripPlan: document.getElementById('tripPlan').value,
                tripServiceType: document.getElementById('tripServiceType').value,
                airportServiceMode: getActiveCabFlow() === 'airport' ? getAirportServiceMode() : '',
                airportServiceLabel: getActiveCabFlow() === 'airport' ? getAirportServiceConfig().label : '',
                airportTerminalNote: getActiveCabFlow() === 'airport'
                    ? sanitizeInput(document.getElementById('cabQuickTerminalInput')?.value || '').trim()
                    : '',
                paymentMethod: document.getElementById('paymentMethod').value,
                passengers: Number.parseInt(document.getElementById('passengers').value, 10) || 1,
                luggage: document.getElementById('luggage').value,
                budgetAmount: Number.parseFloat(document.getElementById('budgetAmount').value || 0) || 0,
                distanceKm: Number.parseFloat(document.getElementById('distanceKm').textContent) || 0,
                distanceSource: sanitizeInput(document.getElementById('distanceSource').textContent || 'fallback'),
                stops: routeStops,
                travelAssurance,
                flightDetails: travelAssurance.flightDetails,
                policyPreferences: travelAssurance.policyPreferences,
                billingDetails: travelAssurance.billingDetails,
                bookingAddOns: travelAssurance.addOns,
                specialRequests: {
                    airCondition: document.getElementById('airCondition').checked,
                    wifi: document.getElementById('wifi').checked,
                    charger: document.getElementById('charger').checked,
                    music: document.getElementById('music').checked
                },
                safetyAccessibility: {
                    womenDriverPref: document.getElementById('womenDriverPref').checked,
                    childSeat: document.getElementById('childSeat').checked,
                    wheelchairAssist: document.getElementById('wheelchairAssist').checked,
                    petFriendly: document.getElementById('petFriendly').checked,
                    liveTripShare: document.getElementById('liveTripShare').checked,
                    maskedCall: document.getElementById('maskedCall').checked
                },
                promoCode: appliedPromo?.code || '',
                notes: sanitizeInput(document.getElementById('notes').value),
                currency: 'INR'
            };
        }

        function routeIsReady(inputs = {}) {
            return Boolean(sanitizeInput(inputs.pickup || '').trim() && sanitizeInput(inputs.drop || inputs.dropoff || '').trim());
        }

        function isLiveDistanceResolved(source) {
            const normalized = String(source || '')
                .toLowerCase()
                .replace(/\s+/g, '_')
                .trim();
            if (!normalized) return false;
            if (normalized === 'awaiting_route' || normalized === 'calculating') return false;
            if (normalized.includes('fallback') || normalized.includes('unavailable') || normalized === 'none') return false;
            return true;
        }

        function renderFareEstimate(estimate = {}) {
            const values = estimate && typeof estimate === 'object' ? estimate : {};
            const hasRoute = routeIsReady(values);
            const setText = (id, text) => {
                const node = document.getElementById(id);
                if (node) node.textContent = text;
            };

            if (Number.isFinite(Number(values.distanceKm))) {
                setText('distanceKm', String(Math.max(0, Math.round(Number(values.distanceKm)))));
            }
            if (values.distanceSource) {
                setText('distanceSource', String(values.distanceSource).replace(/_/g, ' '));
            }

            setText('baseFare', formatCurrency(values.baseFare || 0));
            setText('distanceFare', formatCurrency(values.distanceFare || 0));
            setText('extraDistanceFare', formatCurrency(values.extraDistanceFare || 0));
            setText(
                'distanceBreakdownNote',
                hasRoute
                    ? `Included: ${Number(values.includedDistanceKm || 0)} km • Extra: ${Number(values.extraDistanceKm || 0)} km`
                    : 'Enter pickup and dropoff to calculate live distance.'
            );
            setText('timeFare', formatCurrency(values.timeFare || 0));
            setText('extraTimeFare', formatCurrency(values.extraTimeFare || 0));
            setText(
                'timeBreakdownNote',
                hasRoute
                    ? `Included: ${Number(values.includedDurationMin || 0)} min • Extra: ${Number(values.extraTimeMin || 0)} min`
                    : 'Time and traffic charges appear after route calculation.'
            );
            setText('passengerFare', formatCurrency(values.passengerFare || 0));
            setText('tripPlanFare', formatCurrency(values.tripPlanFare || 0));
            setText('luggageFare', formatCurrency(values.luggageFare || 0));
            setText('extrasFare', formatCurrency(values.extrasFare || 0));
            setText('safetyFare', formatCurrency(values.safetyFare || 0));
            setText('stopFare', formatCurrency(values.stopFare || 0));
            setText('returnTripFare', formatCurrency(values.roundTripCharge || values.returnTripFare || 0));
            setText('tollFare', formatCurrency(values.tollCharge || 0));
            const tollPlazas = Array.isArray(values.tollPlazas) ? values.tollPlazas : [];
            const tollNames = tollPlazas.map((item) => item && item.name).filter(Boolean).slice(0, 4).join(', ');
            const tollSource = String(values.tollSource || '').replace(/_/g, ' ');
            const tollNote = tollPlazas.length
                ? `Mapped toll plazas: ${tollNames}${tollPlazas.length > 4 ? ` +${tollPlazas.length - 4} more` : ''}${values.tollUsedReturnRate ? ' • return rate' : ''}`
                : (hasRoute && tollSource ? `Toll source: ${tollSource}` : 'Toll source: awaiting mapped route');
            setText('tollBreakdownNote', tollNote);
            setText('parkingFare', formatCurrency(values.parkingCharge || 0));
            setText('stateTaxFare', formatCurrency(values.otherStateTax || values.stateTax || 0));
            setText('nightFare', formatCurrency(values.driverNightBatta || values.nightCharge || 0));
            const customerBidAmount = Number(values.customerBidAmount || values.budgetAmount || 0);
            setText('customerBidFare', customerBidAmount > 0 ? formatCurrency(customerBidAmount) : '₹0');
            setText('paymentFee', formatCurrency(values.paymentFee || 0));
            setText('taxesFare', formatCurrency(values.taxesFare || 0));
            setText('promoDiscount', `-${formatCurrency(values.promoDiscount || 0)}`);
            setText('totalFare', formatCurrency(values.totalFare || values.amount || 0));

            latestFareEstimate = values;
            syncCabMiniFare(values);
            updateBookingExperience();
            return Number(values.totalFare || values.amount || 0);
        }

        function createAwaitingFareEstimate(inputs = {}) {
            return {
                ...inputs,
                distanceKm: 0,
                distanceSource: 'Awaiting route',
                baseFare: 0,
                distanceFare: 0,
                includedDistanceKm: 0,
                extraDistanceKm: 0,
                extraDistanceFare: 0,
                includedDurationMin: 0,
                estimatedDurationMin: 0,
                extraTimeMin: 0,
                extraTimeFare: 0,
                timeFare: 0,
                passengerFare: 0,
                tripPlanFare: 0,
                luggageFare: 0,
                extrasFare: 0,
                safetyFare: 0,
                stopFare: 0,
                returnTripFare: 0,
                roundTripCharge: 0,
                tollCharge: 0,
                parkingCharge: 0,
                stateTax: 0,
                otherStateTax: 0,
                nightCharge: 0,
                driverNightBatta: 0,
                paymentFee: 0,
                taxesFare: 0,
                promoDiscount: 0,
                totalFare: 0,
                amount: 0,
                finalFare: 0,
                customerBidAmount: Number(inputs.budgetAmount || 0),
                budgetAmount: Number(inputs.budgetAmount || 0),
                budgetGap: Number(inputs.budgetAmount || 0)
            };
        }

        function buildFallbackFareEstimate(inputs = {}) {
            if (!routeIsReady(inputs)) {
                return createAwaitingFareEstimate(inputs);
            }
            const distance = Math.max(1, Number(inputs.distanceKm || 5));
            const baseFare = 50;
            const includedDistanceKm = Math.min(distance, 5);
            const extraDistanceKm = Math.max(0, distance - includedDistanceKm);
            const distanceFare = Math.round(includedDistanceKm * 10);
            const extraDistanceFare = Math.round(extraDistanceKm * 12);
            const includedDurationMin = 20;
            const estimatedDurationMin = Math.max(includedDurationMin, Math.round(distance * 3));
            const extraTimeMin = Math.max(0, estimatedDurationMin - includedDurationMin);
            const timeFare = Math.round(includedDurationMin * 0.8);
            const extraTimeFare = Math.round(extraTimeMin * 1.1);
            const subtotal = baseFare + distanceFare + extraDistanceFare + timeFare + extraTimeFare;
            const totalFare = Math.max(99, subtotal + Math.round(subtotal * 0.05));
            return {
                ...inputs,
                distanceKm: distance,
                baseFare,
                distanceFare,
                includedDistanceKm,
                extraDistanceKm,
                extraDistanceFare,
                includedDurationMin,
                estimatedDurationMin,
                extraTimeMin,
                extraTimeFare,
                timeFare,
                passengerFare: 0,
                tripPlanFare: 0,
                luggageFare: 0,
                extrasFare: 0,
                safetyFare: 0,
                stopFare: 0,
                returnTripFare: 0,
                roundTripCharge: 0,
                tollCharge: 0,
                parkingCharge: 0,
                stateTax: 0,
                otherStateTax: 0,
                nightCharge: 0,
                driverNightBatta: 0,
                paymentFee: 0,
                taxesFare: Math.round(subtotal * 0.05),
                promoDiscount: 0,
                totalFare,
                amount: totalFare,
                finalFare: totalFare,
                customerBidAmount: Number(inputs.budgetAmount || 0),
                budgetAmount: Number(inputs.budgetAmount || 0),
                budgetGap: Math.round(Number(inputs.budgetAmount || 0) - totalFare),
                distanceSource: inputs.distanceSource || 'fallback'
            };
        }

        function updateFare() {
            const calculator = getFareCalculator();
            const inputs = readFareEstimateInputs();
            if (!routeIsReady(inputs)) {
                return renderFareEstimate(createAwaitingFareEstimate(inputs));
            }
            const estimate = calculator ? calculator.estimateBookingFare(inputs) : buildFallbackFareEstimate(inputs);

            if (appliedPromo) {
                if (estimate.promoDiscount > 0) {
                    setPromoStatus(`Applied ${appliedPromo.code}: Saved ${formatCurrency(estimate.promoDiscount)}`, 'success');
                } else {
                    setPromoStatus(`${appliedPromo.code} is not applicable for the selected trip or payment mode`, 'error');
                }
            }

            return renderFareEstimate(estimate);
        }

        // ============================================
        // LOCATION FUNCTIONS
        // ============================================

        // Update route highlights when locations change
        function updateRouteHighlights() {
            const pickup = document.getElementById('pickup').value;
            const dropoff = document.getElementById('dropoff').value;
            
            if (pickup && dropoff && typeof showRouteHighlights === 'function') {
                showRouteHighlights(pickup, dropoff, 'routeHighlightsContainer');
            }
        }

        let distanceEstimateToken = 0;

        function updateRoutePreview(statusText = '') {
            const pickup = sanitizeInput(document.getElementById('pickup')?.value || '').trim();
            const dropoff = sanitizeInput(document.getElementById('dropoff')?.value || '').trim();
            const distance = sanitizeInput(document.getElementById('distanceKm')?.textContent || '0');
            const source = sanitizeInput(document.getElementById('distanceSource')?.textContent || '');
            const titleNode = document.getElementById('routePreviewTitle');
            const textNode = document.getElementById('routePreviewText');
            const linkNode = document.getElementById('routePreviewLink');

            if (!titleNode || !textNode || !linkNode) return;

            if (!pickup || !dropoff) {
                titleNode.textContent = 'Live route preview';
                textNode.textContent = 'Enter pickup and dropoff to calculate fare and route.';
                linkNode.style.display = 'none';
                linkNode.removeAttribute('href');
                return;
            }

            const cleanedSource = source && source !== 'Awaiting route' ? ` • ${source}` : '';
            titleNode.textContent = `${pickup} to ${dropoff}`;
            textNode.textContent = statusText || `${distance || '0'} km route ready${cleanedSource}`;
            const origin = getBookingMapQueryValue('pickup') || pickup;
            const destination = getBookingMapQueryValue('dropoff') || dropoff;
            linkNode.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
            linkNode.style.display = 'inline-flex';
        }

        async function updateDistanceEstimate() {
            const pickup = sanitizeInput(document.getElementById('pickup').value).trim();
            const dropoff = sanitizeInput(document.getElementById('dropoff').value).trim();
            const pickupQuery = getBookingMapQueryValue('pickup') || pickup;
            const dropoffQuery = getBookingMapQueryValue('dropoff') || dropoff;
            const sourceNode = document.getElementById('distanceSource');

            if (!pickup || !dropoff) {
                document.getElementById('distanceKm').textContent = '0';
                if (sourceNode) sourceNode.textContent = 'Awaiting route';
                updateRoutePreview();
                updateFare();
                return;
            }

            const token = ++distanceEstimateToken;
            let previewStatus = '';
            if (sourceNode) sourceNode.textContent = 'Calculating...';
            updateRoutePreview('Calculating live distance...');

            try {
                if (window.LocationDistanceEstimator && typeof LocationDistanceEstimator.estimateDistanceKm === 'function') {
                    const estimate = await LocationDistanceEstimator.estimateDistanceKm(pickupQuery, dropoffQuery);
                    if (token !== distanceEstimateToken) return;

                    const km = Number(estimate && estimate.km);
                    const finalKm = Number.isFinite(km) && km > 0 ? Math.max(1, Math.round(km)) : 0;
                    document.getElementById('distanceKm').textContent = String(finalKm);

                    if (sourceNode) {
                        const rawSource = String((estimate && estimate.source) || '');
                        sourceNode.textContent = rawSource
                            ? rawSource.replace(/_/g, ' ')
                            : (BOOKING_STRICT_LIVE_MODE ? 'live route unavailable' : 'fallback');
                    }
                } else {
                    document.getElementById('distanceKm').textContent = '0';
                    if (sourceNode) sourceNode.textContent = BOOKING_STRICT_LIVE_MODE ? 'live route unavailable' : 'fallback';
                    if (BOOKING_STRICT_LIVE_MODE) {
                        previewStatus = 'Live route temporarily unavailable. Please refine pickup/drop and try again.';
                    }
                }
            } catch (error) {
                document.getElementById('distanceKm').textContent = '0';
                if (sourceNode) sourceNode.textContent = BOOKING_STRICT_LIVE_MODE ? 'live route unavailable' : 'fallback';
                if (BOOKING_STRICT_LIVE_MODE) {
                    previewStatus = 'Live route temporarily unavailable. Please refine pickup/drop and try again.';
                }
            }

            updateRoutePreview(previewStatus);
            updateFare();
        }

        function handleLocationUpdated() {
            updateRouteHighlights();
            updateDistanceEstimate();
        }

        // Add event listeners for location changes
        document.getElementById('pickup').addEventListener('change', handleLocationUpdated);
        document.getElementById('dropoff').addEventListener('change', handleLocationUpdated);
        document.getElementById('pickup').addEventListener('blur', handleLocationUpdated);
        document.getElementById('dropoff').addEventListener('blur', handleLocationUpdated);
        document.getElementById('pickup').addEventListener('input', handleLocationUpdated);
        document.getElementById('dropoff').addEventListener('input', handleLocationUpdated);

        function swapLocations() {
            const pickup = document.getElementById('pickup').value;
            const dropoff = document.getElementById('dropoff').value;

            document.getElementById('pickup').value = dropoff;
            document.getElementById('dropoff').value = pickup;

            updateFare();
            updateDistanceEstimate();
        }

        // ============================================
        // BOOKING FUNCTION
        // ============================================

        function broadcastPortalNotification(payload) {
            if (!window.PortalConnector || !payload) return;

            if (typeof PortalConnector.broadcastToAll === 'function') {
                PortalConnector.broadcastToAll(payload);
                return;
            }

            PortalConnector.createNotification({
                ...payload,
                targetPortals: ['customer', 'driver', 'admin']
            });
        }

        function buildLocalDateTime(dateValue, timeValue) {
            if (!dateValue || !timeValue) return null;
            const dateTime = new Date(`${dateValue}T${timeValue}`);
            return Number.isNaN(dateTime.getTime()) ? null : dateTime;
        }

        function normalizeApiBase(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            return raw.replace(/\/$/, '');
        }

        function resolveApiBaseHost(apiBase) {
            try {
                return String(new URL(String(apiBase || '')).hostname || '').toLowerCase();
            } catch (_error) {
                return '';
            }
        }

        function readApiBaseQuarantineMap() {
            try {
                const parsed = JSON.parse(localStorage.getItem(API_BASE_QUARANTINE_KEY) || '{}');
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    return {};
                }
                return parsed;
            } catch (_error) {
                return {};
            }
        }

        function writeApiBaseQuarantineMap(map) {
            const normalized = map && typeof map === 'object' ? map : {};
            localStorage.setItem(API_BASE_QUARANTINE_KEY, JSON.stringify(normalized));
        }

        function purgeExpiredApiBaseQuarantine(map) {
            const source = map && typeof map === 'object' ? map : {};
            const now = Date.now();
            const next = {};
            Object.keys(source).forEach((base) => {
                const entry = source[base];
                const untilMs = Number(entry && entry.untilMs || 0);
                if (untilMs > now) {
                    next[base] = {
                        untilMs,
                        reason: sanitizeInput(entry.reason || 'api_unavailable', 120),
                        status: Number(entry.status || 0),
                        updatedAt: sanitizeInput(entry.updatedAt || '', 40)
                    };
                }
            });
            return next;
        }

        function getApiBaseQuarantineEntry(apiBase) {
            const base = normalizeApiBase(apiBase);
            if (!base) return null;
            const map = purgeExpiredApiBaseQuarantine(readApiBaseQuarantineMap());
            writeApiBaseQuarantineMap(map);
            return map[base] || null;
        }

        function isApiBaseQuarantined(apiBase) {
            const entry = getApiBaseQuarantineEntry(apiBase);
            return Boolean(entry && Number(entry.untilMs || 0) > Date.now());
        }

        function clearApiBaseQuarantine(apiBase) {
            const base = normalizeApiBase(apiBase);
            if (!base) return;
            const map = purgeExpiredApiBaseQuarantine(readApiBaseQuarantineMap());
            if (!Object.prototype.hasOwnProperty.call(map, base)) return;
            delete map[base];
            writeApiBaseQuarantineMap(map);
        }

        function quarantineApiBase(apiBase, reason = 'api_unavailable', status = 0, ttlMs = API_BASE_QUARANTINE_DEFAULT_MS) {
            const base = normalizeApiBase(apiBase);
            if (!base) return;
            const normalizedTtl = Math.max(30 * 1000, Math.min(Number(ttlMs || 0), API_BASE_QUARANTINE_STATIC_MS));
            const map = purgeExpiredApiBaseQuarantine(readApiBaseQuarantineMap());
            map[base] = {
                untilMs: Date.now() + normalizedTtl,
                reason: sanitizeInput(reason || 'api_unavailable', 120),
                status: Number(status || 0),
                updatedAt: new Date().toISOString()
            };
            writeApiBaseQuarantineMap(map);
        }

        function shouldQuarantineApiBase(apiBase, status, reason = '') {
            const normalizedStatus = Number(status || 0);
            const host = resolveApiBaseHost(apiBase);
            const normalizedReason = String(reason || '').toLowerCase();
            const isGoIndiaHost = /(^|\.)goindiaride\.in$/.test(host);
            const isSiteStaticHost = isGoIndiaHost && host !== 'api.goindiaride.in';

            if (normalizedStatus === 405 && isSiteStaticHost) {
                return true;
            }

            if (normalizedStatus === 404 && isSiteStaticHost) {
                return true;
            }

            if (
                normalizedStatus === 0 &&
                (normalizedReason.includes('network') ||
                normalizedReason.includes('fetch') ||
                normalizedReason.includes('resolve') ||
                normalizedReason.includes('dns') ||
                normalizedReason.includes('econnrefused')) &&
                isGoIndiaHost
            ) {
                return true;
            }

            return false;
        }

        function getAdminEmailPendingReason(result = {}) {
            const attempts = Array.isArray(result.attempts) ? result.attempts : [];
            if (attempts.some((attempt) => Number(attempt && attempt.status || 0) === 405)) {
                return 'api_proxy_not_configured_405';
            }
            if (attempts.some((attempt) => Number(attempt && attempt.status || 0) === 404)) {
                return 'api_route_missing_404';
            }
            const reason = String(result.reason || '').toLowerCase();
            if (reason.includes('request_timeout') || reason.includes('timeout')) {
                return 'api_request_timeout';
            }
            if (
                reason.includes('failed to fetch') ||
                reason.includes('network') ||
                reason.includes('dns') ||
                reason.includes('resolve') ||
                reason.includes('econnrefused')
            ) {
                return 'api_domain_unreachable';
            }
            return sanitizeInput(result.reason || 'server_api_unavailable', 90);
        }

        function isDeprecatedApiBase(base) {
            const normalized = normalizeApiBase(base).toLowerCase();
            if (!normalized) return false;
            return normalized.includes('cloudfunctions.net') || normalized.includes('api.goindiaride.in');
        }

        function isFrontendOnlyApiBase(base) {
            try {
                const parsed = new URL(normalizeApiBase(base));
                const host = String(parsed.hostname || '').toLowerCase();
                return host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
            } catch (_error) {
                return false;
            }
        }

        function getBackendApiBaseCandidates() {
            const host = String(window.location.hostname || '').toLowerCase();
            const originBase = normalizeApiBase(window.location.origin || '');
            const fromWindow = normalizeApiBase(window.GOINDIARIDE_API_BASE || '');
            const fromStorage = normalizeApiBase(localStorage.getItem('goindiaride_api_base') || '');
            const fromRuntime = normalizeApiBase(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '');
            const renderPrimaryBase = 'https://goindiaride.onrender.com';
            const isPrimaryWebsiteHost = host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
            const isGitHubPagesHost = host === 'github.io' || host.endsWith('.github.io');
            const avoidSameOriginFallback = isPrimaryWebsiteHost || isGitHubPagesHost;
            const allowLegacyBackendPath = window.__GOINDIARIDE_ALLOW_LEGACY_BACKEND_PATH__ === true;

            if (isPrimaryWebsiteHost || isGitHubPagesHost) {
                if (isDeprecatedApiBase(fromStorage)) {
                    localStorage.removeItem('goindiaride_api_base');
                }
                if (isDeprecatedApiBase(fromRuntime)) {
                    window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ = renderPrimaryBase;
                }
                if (isDeprecatedApiBase(window.__GOINDIARIDE_API_ORIGIN__ || '')) {
                    window.__GOINDIARIDE_API_ORIGIN__ = renderPrimaryBase;
                }
            }

            const candidates = [];
            const pushUnique = (candidate) => {
                const base = normalizeApiBase(candidate);
                if (!base) return;
                if (!/^https?:\/\//i.test(base)) return;
                if (isDeprecatedApiBase(base)) return;
                if (avoidSameOriginFallback && isFrontendOnlyApiBase(base)) return;
                if (isApiBaseQuarantined(base)) return;
                if (!candidates.includes(base)) {
                    candidates.push(base);
                }
            };

            // Production website must prioritize Render backend directly.
            if (isPrimaryWebsiteHost || isGitHubPagesHost) {
                pushUnique(renderPrimaryBase);
            }

            // Next priority: explicit/runtime overrides (after sanitization).
            pushUnique(fromRuntime);
            pushUnique(fromStorage);
            pushUnique(fromWindow);

            // Local dev default backend.
            if (host === 'localhost' || host === '127.0.0.1') {
                pushUnique('http://localhost:5000');
            }

            // Same-origin root fallback only on non-primary hosts.
            if (!avoidSameOriginFallback) {
                pushUnique(originBase);
            }

            // Keep legacy reverse-proxy fallback as opt-in on primary static hosts.
            if (originBase && (!avoidSameOriginFallback || allowLegacyBackendPath)) {
                pushUnique(`${originBase}/backend`);
            }

            return candidates;
        }

        function getBackendApiBase() {
            const candidates = getBackendApiBaseCandidates();
            if (candidates.length > 0) {
                return candidates[0];
            }
            return normalizeApiBase(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || window.location.origin || '');
        }

        function isLikelyEmailAddress(value) {
            const email = String(value || '').trim().toLowerCase();
            return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
        }

        function normalizeCustomerPhoneValue(value, includeCountryCode = false) {
            const raw = String(value || '').trim();
            if (!raw) return '';

            let normalized = raw.replace(/\s+/g, '');
            if (normalized.startsWith('00')) {
                normalized = '+' + normalized.slice(2);
            }

            if (normalized.startsWith('+')) {
                const digits = normalized.slice(1).replace(/\D/g, '');
                if (digits.length < 8 || digits.length > 15) return '';
                return '+' + digits;
            }

            const digitsOnly = normalized.replace(/\D/g, '');
            if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
                return includeCountryCode ? `+91${digitsOnly}` : `+91${digitsOnly}`;
            }
            if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
                return '+' + digitsOnly;
            }

            return '';
        }

        function customerAccountRole(row = {}) {
            return sanitizeInput(row.role || row.userRole || row.accountType || row.userType || row.type || row.portalType || '', 80).toLowerCase();
        }

        function customerPhoneLooksUsable(value) {
            return Boolean(normalizeCustomerPhoneValue(value));
        }

        function customerEmailLooksUsable(value) {
            const email = sanitizeInput(value || '', 180).toLowerCase();
            return Boolean(email && email.includes('@') && email !== 'customer@example.com');
        }

        function customerIdentityName(row = {}) {
            return sanitizeInput(row.driverName || row.name || row.fullName || row.fullname || row.customerName || '', 140).toLowerCase();
        }

        function customerRowLooksDriver(row = {}) {
            const role = customerAccountRole(row);
            const source = sanitizeInput(row.sourceKey || row.source || '', 120).toLowerCase();
            const identityName = customerIdentityName(row);
            const hasCustomerContact = Boolean(
                row.customerId
                || row.customerName
                || customerEmailLooksUsable(row.customerEmail || row.email || row.userEmail)
                || customerPhoneLooksUsable(row.customerPhone || row.phone || row.mobile)
            );
            return role.includes('driver')
                || source.includes('driver')
                || Boolean(identityName.includes('driver') && !hasCustomerContact)
                || Boolean(row.driverId)
                || Boolean(row.driverName)
                || Boolean(row.vehicleNumber)
                || Boolean(row.vehicleModel && !row.customerId && !row.customerName)
                || Boolean(row.vehicleType && !row.customerId && !row.customerName && !row.customerEmail);
        }

        function customerRowLooksCustomer(row = {}) {
            const role = customerAccountRole(row);
            if (role && role.includes('driver')) return false;
            if (role && (role.includes('customer') || role.includes('user'))) return true;
            return Boolean(
                row.customerId
                || row.customerName
                || customerEmailLooksUsable(row.customerEmail || row.email || row.userEmail)
                || customerPhoneLooksUsable(row.customerPhone || row.phone || row.mobile)
            );
        }

        function isTruthyVerificationFlag(value) {
            if (value === true) return true;
            const normalized = String(value || '').trim().toLowerCase();
            return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'verified';
        }

        function readLocalArrayFromKeys(keys) {
            for (const key of keys) {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                    if (Array.isArray(parsed) && parsed.length) {
                        return parsed.filter((item) => item && typeof item === 'object');
                    }
                } catch (_error) {
                    // Ignore malformed local cache entries and keep scanning fallbacks.
                }
            }
            return [];
        }

        function getCustomerAccountLookupRows() {
            return readLocalArrayFromKeys([
                'users',
                'goride_users',
                'customers',
                'goindiaride_users',
                'goindiaride_customers',
                'registeredUsers',
                'registered_users',
                'goindia_users',
                'goindiaride_user_accounts',
                'user_accounts'
            ]).filter((item) => customerRowLooksCustomer(item) && !customerRowLooksDriver(item));
        }

        function persistResolvedCurrentUserSession(partial = {}) {
            currentUser = {
                ...(currentUser || {}),
                ...(partial && typeof partial === 'object' ? partial : {})
            };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        }

        function resolveCurrentCustomerEmail() {
            const directEmail = sanitizeInput(currentUser && currentUser.email, 180).toLowerCase();
            if (isLikelyEmailAddress(directEmail)) {
                return directEmail;
            }

            const safePhone = sanitizeInput((currentUser && currentUser.phone) || '', 40).replace(/[^\d+]/g, '');
            const safeUserId = sanitizeInput((currentUser && currentUser.id) || '', 120);
            const candidateRows = getCustomerAccountLookupRows();

            const matched = candidateRows.find((item) => {
                const itemEmail = sanitizeInput(item.email || item.userEmail || '', 180).toLowerCase();
                const itemPhone = sanitizeInput(item.phone || item.mobile || '', 40).replace(/[^\d+]/g, '');
                const itemId = sanitizeInput(item.id || '', 120);
                if (safeUserId && itemId && itemId === safeUserId && isLikelyEmailAddress(itemEmail)) {
                    return true;
                }
                if (safePhone && itemPhone && itemPhone === safePhone && isLikelyEmailAddress(itemEmail)) {
                    return true;
                }
                return false;
            });

            const resolvedEmail = sanitizeInput(matched && matched.email, 180).toLowerCase();
            if (!isLikelyEmailAddress(resolvedEmail)) {
                return '';
            }

            persistResolvedCurrentUserSession({
                email: resolvedEmail
            });
            return resolvedEmail;
        }

        const BOOKING_PHONE_OTP_REQUIRED = window.__GOINDIARIDE_BOOKING_OTP_REQUIRED__ === true;

        function syncBookingOtpUiState() {
            if (!document.body) return;
            document.body.classList.toggle('booking-otp-required', Boolean(BOOKING_PHONE_OTP_REQUIRED));
        }

        syncBookingOtpUiState();

        function resolveCurrentCustomerPhoneMeta() {
            const directLocalPhone = normalizeCustomerPhoneValue((currentUser && (currentUser.phone || currentUser.mobile)) || '');
            const formPhone = normalizeCustomerPhoneValue(document.getElementById('bookingCustomerPhone')?.value || '');
            const safeUserId = sanitizeInput((currentUser && currentUser.id) || '', 120);
            const safeEmail = sanitizeInput((currentUser && currentUser.email) || '', 180).toLowerCase();
            const candidateRows = getCustomerAccountLookupRows();

            const matched = candidateRows.find((item) => {
                const itemId = sanitizeInput(item.id || item.backendUserId || '', 120);
                const itemEmail = sanitizeInput(item.email || item.userEmail || '', 180).toLowerCase();
                const itemPhone = normalizeCustomerPhoneValue(item.phone || item.mobile || item.contact || item.contact1 || '');
                if (safeUserId && itemId && itemId === safeUserId) {
                    return true;
                }
                if (safeEmail && itemEmail && itemEmail === safeEmail) {
                    return true;
                }
                if (directLocalPhone && itemPhone && itemPhone === directLocalPhone) {
                    return true;
                }
                return false;
            });

            const matchedLocalPhone = normalizeCustomerPhoneValue(
                matched && (matched.phone || matched.mobile || matched.contact || matched.contact1 || '')
            );
            const resolvedLocalPhone = formPhone || directLocalPhone || matchedLocalPhone;
            const formPhoneNeedsVerification = Boolean(BOOKING_PHONE_OTP_REQUIRED && formPhone && formPhone !== directLocalPhone && formPhone !== matchedLocalPhone);
            const hasVerificationMarker = Boolean(
                BOOKING_PHONE_OTP_REQUIRED && (
                    formPhoneNeedsVerification
                    || (currentUser && (Object.prototype.hasOwnProperty.call(currentUser, 'isPhoneVerified') || Object.prototype.hasOwnProperty.call(currentUser, 'phoneVerified')))
                    || (matched && (
                        Object.prototype.hasOwnProperty.call(matched, 'isPhoneVerified')
                        || Object.prototype.hasOwnProperty.call(matched, 'phoneVerified')
                        || Object.prototype.hasOwnProperty.call(matched, 'mobileVerified')
                    ))
                )
            );
            const verified = BOOKING_PHONE_OTP_REQUIRED
                ? Boolean(
                    isTruthyVerificationFlag(currentUser && (currentUser.isPhoneVerified || currentUser.phoneVerified))
                    || isTruthyVerificationFlag(matched && (matched.isPhoneVerified || matched.phoneVerified || matched.mobileVerified))
                )
                : Boolean(resolvedLocalPhone);

            if (resolvedLocalPhone) {
                persistResolvedCurrentUserSession({
                    phone: resolvedLocalPhone,
                    phoneE164: resolvedLocalPhone,
                    ...(BOOKING_PHONE_OTP_REQUIRED && hasVerificationMarker ? { isPhoneVerified: verified } : {})
                });
            }

            return {
                localPhone: resolvedLocalPhone,
                displayPhone: resolvedLocalPhone || '',
                verified: hasVerificationMarker ? verified : Boolean(resolvedLocalPhone),
                hasVerificationMarker
            };
        }

        const BOOKING_PHONE_VERIFICATION_SESSION_KEY = 'goindiaride-booking-phone-verify';
        const BOOKING_PHONE_BACKEND_OTP_SESSION_KEY = 'goindiaride-booking-phone-backend-otp';
        const BOOKING_PHONE_REVIEW_FALLBACK_KEY = 'goindiaride-booking-phone-review-fallback';
        const BOOKING_PHONE_BACKEND_OTP_TTL_MS = 7 * 60 * 1000;
        const BOOKING_PHONE_REVIEW_FALLBACK_TTL_MS = 45 * 60 * 1000;
        const BOOKING_PHONE_SERVICE_FALLBACK_MESSAGE = 'Phone verification service is temporarily unavailable. Please try Send OTP again in a moment or contact support.';

        function isBookingPhoneServiceUnavailableReason(message) {
            const text = String(message || '').trim().toLowerCase();
            if (!text) return false;
            return (
                text.includes('firebase key mismatch')
                || text.includes('auth/invalid-api-key')
                || text.includes('invalid api key')
                || text.includes('firebae_key')
                || text.includes('firebase_key')
                || text.includes('firebase phone verification config')
                || text.includes('phone verification library load')
                || text.includes('firebase domain/recaptcha')
                || text.includes('auth/unauthorized-domain')
                || text.includes('captcha-check-failed')
                || text.includes('recaptcha')
                || text.includes('phone verification service is still loading')
                || text.includes('mobile otp provider is not configured')
                || text.includes('sms/whatsapp settings')
                || text.includes('sms_provider_not_configured')
                || text.includes('meta_send_failed')
                || text.includes('meta_request_failed')
                || text.includes('meta token')
                || text.includes('twilio_send_failed')
                || text.includes('twilio_request_failed')
                || text.includes('msg91_send_failed')
                || text.includes('fast2sms_not_configured')
                || text.includes('fast2sms_send_failed')
                || text.includes('msg91_not_configured')
                || text.includes('twilio_sms_not_configured')
                || text.includes('api_domain_unreachable')
                || text.includes('server_api_unavailable')
                || text.includes('all_api_candidates_failed')
                || text.includes('no_available_api_base_candidates')
                || text.includes('request_timeout')
                || text.includes('network_error')
                || text.includes('failed to fetch')
            );
        }

        function getBookingPhoneCustomerMessage(message, fallback = 'Phone verification failed. Please retry.') {
            const rawMessage = String(message || '').trim();
            if (!rawMessage) return fallback;
            const lower = rawMessage.toLowerCase();
            if (isBookingPhoneServiceUnavailableReason(rawMessage)) {
                return BOOKING_PHONE_SERVICE_FALLBACK_MESSAGE;
            }
            if (lower.includes('otp not found') || lower.includes('pehle otp')) {
                return 'Please send OTP first, then enter the code here.';
            }
            if (lower.includes('otp already used')) {
                return 'This OTP is already used. Please request a new OTP.';
            }
            if (lower.includes('otp expired')) {
                return 'OTP expired. Please request a new OTP.';
            }
            if (lower.includes('invalid otp') || lower.includes('invalid-verification-code') || lower.includes('wrong')) {
                return 'OTP code is not correct. Please check the SMS and try again.';
            }
            return rawMessage;
        }

        function shouldTryFirebaseAfterBackendOtpFailure(message) {
            const text = String(message || '').trim().toLowerCase();
            return (
                text.includes('api_domain_unreachable')
                || text.includes('server_api_unavailable')
                || text.includes('all_api_candidates_failed')
                || text.includes('no_available_api_base_candidates')
                || text.includes('request_timeout')
                || text.includes('network_error')
                || text.includes('failed to fetch')
            );
        }

        function setBookingPhoneReviewFallback(phone, reason = '') {
            const normalizedPhone = normalizeCustomerPhoneValue(phone);
            if (!normalizedPhone) return;
            try {
                sessionStorage.setItem(BOOKING_PHONE_REVIEW_FALLBACK_KEY, JSON.stringify({
                    phone: normalizedPhone,
                    reason: sanitizeInput(reason || 'phone_verification_service_unavailable', 180),
                    createdAt: Date.now()
                }));
            } catch (_error) {
                // Ignore storage restrictions; the current submit attempt can still proceed.
            }
        }

        function getBookingPhoneReviewFallback(phone = '') {
            const normalizedPhone = normalizeCustomerPhoneValue(phone);
            try {
                const parsed = JSON.parse(sessionStorage.getItem(BOOKING_PHONE_REVIEW_FALLBACK_KEY) || '{}');
                const storedPhone = normalizeCustomerPhoneValue(parsed.phone || '');
                const createdAt = Number(parsed.createdAt || 0);
                const fresh = createdAt && Date.now() - createdAt < BOOKING_PHONE_REVIEW_FALLBACK_TTL_MS;
                if (storedPhone && fresh && (!normalizedPhone || storedPhone === normalizedPhone)) {
                    return {
                        phone: storedPhone,
                        reason: sanitizeInput(parsed.reason || 'phone_verification_service_unavailable', 180)
                    };
                }
            } catch (_error) {
                // Ignore malformed session storage.
            }
            return null;
        }

        function clearBookingPhoneReviewFallback() {
            try {
                sessionStorage.removeItem(BOOKING_PHONE_REVIEW_FALLBACK_KEY);
            } catch (_error) {
                // Ignore storage restrictions.
            }
        }

        function setBookingBackendOtpSession(phone, apiBase = '') {
            const normalizedPhone = normalizeCustomerPhoneValue(phone);
            if (!normalizedPhone) return;
            try {
                sessionStorage.setItem(BOOKING_PHONE_BACKEND_OTP_SESSION_KEY, JSON.stringify({
                    phone: normalizedPhone,
                    apiBase: sanitizeInput(apiBase || '', 240),
                    sentAt: Date.now()
                }));
            } catch (_error) {
                // Ignore storage restrictions.
            }
        }

        function getBookingBackendOtpSession(phone = '') {
            const normalizedPhone = normalizeCustomerPhoneValue(phone);
            try {
                const parsed = JSON.parse(sessionStorage.getItem(BOOKING_PHONE_BACKEND_OTP_SESSION_KEY) || '{}');
                const storedPhone = normalizeCustomerPhoneValue(parsed.phone || '');
                const sentAt = Number(parsed.sentAt || 0);
                const fresh = sentAt && Date.now() - sentAt < BOOKING_PHONE_BACKEND_OTP_TTL_MS;
                if (storedPhone && fresh && (!normalizedPhone || storedPhone === normalizedPhone)) {
                    return {
                        phone: storedPhone,
                        apiBase: sanitizeInput(parsed.apiBase || '', 240)
                    };
                }
            } catch (_error) {
                // Ignore malformed session storage.
            }
            return null;
        }

        function clearBookingBackendOtpSession() {
            try {
                sessionStorage.removeItem(BOOKING_PHONE_BACKEND_OTP_SESSION_KEY);
            } catch (_error) {
                // Ignore storage restrictions.
            }
        }

        function getBookingDeviceFingerprint() {
            if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.buildClientDeviceFingerprint === 'function') {
                return window.GoIndiaSessionContinuity.buildClientDeviceFingerprint();
            }

            const key = 'goindiaride_device_fingerprint_v1';
            try {
                const existing = String(localStorage.getItem(key) || '').trim();
                if (existing) return existing;
            } catch (_error) {
                // Continue with an in-memory fingerprint.
            }

            const parts = [
                navigator.userAgent || '',
                navigator.language || '',
                screen && `${screen.width}x${screen.height}x${screen.colorDepth}`,
                Intl.DateTimeFormat().resolvedOptions().timeZone || ''
            ];
            let hash = 2166136261;
            const input = parts.join('|');
            for (let index = 0; index < input.length; index += 1) {
                hash ^= input.charCodeAt(index);
                hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
            }
            const fingerprint = `web_${(hash >>> 0).toString(16)}`;
            try {
                localStorage.setItem(key, fingerprint);
            } catch (_error) {
                // Ignore storage restrictions.
            }
            return fingerprint;
        }

        function setBookingPhoneStatus(message, type = '') {
            const node = document.getElementById('bookingPhoneStatus');
            if (!node) return;
            const rawMessage = String(message || '').trim();
            node.dataset.rawMessage = rawMessage;
            node.textContent = getBookingPhoneCustomerMessage(rawMessage, '');
            node.classList.remove('success', 'error');
            if (type) {
                node.classList.add(type);
            }
        }

        function updateCustomerAccountStoresWithPhone(phone, verified) {
            const safePhone = normalizeCustomerPhoneValue(phone);
            if (!safePhone) return;

            const safeUserId = sanitizeInput((currentUser && currentUser.id) || '', 120);
            const safeEmail = sanitizeInput((currentUser && currentUser.email) || '', 180).toLowerCase();
            const keys = [
                'users',
                'goride_users',
                'customers',
                'goindiaride_users',
                'goindiaride_customers',
                'registeredUsers',
                'registered_users',
                'goindia_users',
                'goindiaride_user_accounts',
                'user_accounts'
            ];

            keys.forEach((key) => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                    if (!Array.isArray(parsed)) return;
                    let changed = false;
                    const nextRows = parsed.map((item) => {
                        if (!item || typeof item !== 'object') return item;
                        const itemId = sanitizeInput(item.id || item.backendUserId || '', 120);
                        const itemEmail = sanitizeInput(item.email || item.userEmail || '', 180).toLowerCase();
                        const itemPhone = normalizeCustomerPhoneValue(item.phone || item.mobile || item.contact || item.contact1 || '');
                        const matches = Boolean(
                            (safeUserId && itemId && itemId === safeUserId)
                            || (safeEmail && itemEmail && itemEmail === safeEmail)
                            || ((currentUser && currentUser.phone) && itemPhone && itemPhone === normalizeCustomerPhoneValue(currentUser.phone))
                        );
                        if (!matches) return item;
                        changed = true;
                        return {
                            ...item,
                            phone: safePhone,
                            mobile: safePhone,
                            isPhoneVerified: Boolean(verified),
                            phoneVerified: Boolean(verified),
                            mobileVerified: Boolean(verified)
                        };
                    });
                    if (changed) {
                        localStorage.setItem(key, JSON.stringify(nextRows));
                    }
                } catch (_error) {
                    // Ignore local storage sync errors.
                }
            });

            try {
                const runtimeProfile = JSON.parse(localStorage.getItem('goindiaride.profile.runtime') || '{}');
                localStorage.setItem('goindiaride.profile.runtime', JSON.stringify({
                    ...(runtimeProfile && typeof runtimeProfile === 'object' ? runtimeProfile : {}),
                    name: (currentUser && (currentUser.fullname || currentUser.name)) || runtimeProfile.name || '',
                    email: (currentUser && currentUser.email) || runtimeProfile.email || '',
                    phone: safePhone,
                    isPhoneVerified: Boolean(verified),
                    phoneVerified: Boolean(verified)
                }));
            } catch (_error) {
                // Ignore runtime profile sync errors.
            }
        }

        async function syncVerifiedPhoneWithBackend(phone) {
            const token = String(getBackendAccessToken() || '').trim();
            if (!token) {
                return { ok: false, reason: 'missing_access_token' };
            }

            const result = await fetchJsonAcrossApiBases('/api/user/profile/phone', {
                method: 'PATCH',
                token,
                includeJson: true,
                includeIdempotency: true,
                idPrefix: 'gir-profile-phone',
                body: {
                    phone,
                    verified: true
                },
                timeoutMs: 10000
            });

            return result;
        }

        async function sendBackendBookingPhoneOtp(normalizedPhone) {
            const result = await fetchJsonAcrossApiBases('/api/auth/request-otp', {
                method: 'POST',
                includeJson: true,
                includeIdempotency: true,
                idPrefix: 'gir-booking-phone-otp',
                body: {
                    channel: 'sms',
                    accountType: 'customer',
                    phone: normalizedPhone
                },
                timeoutMs: 14000
            });

            const data = result.data || {};
            const delivery = data.delivery || {};
            const deliverySent = Boolean(delivery.sent);
            if (result.ok && deliverySent) {
                setBookingBackendOtpSession(normalizedPhone, result.apiBase || '');
                clearBookingPhoneReviewFallback();
                return {
                    ok: true,
                    provider: sanitizeInput(delivery.provider || 'backend_sms', 80),
                    apiBase: result.apiBase || ''
                };
            }

            const reason = sanitizeInput(
                [delivery.reason, delivery.message, data.message, result.reason, 'backend_sms_otp_failed'].filter(Boolean).join(': '),
                260
            );
            throw new Error(reason);
        }

        function storeBackendPhoneVerificationSession(data = {}, verifiedPhone = '') {
            const accessToken = String(data.accessToken || '').trim();
            const refreshToken = String(data.refreshToken || '').trim();
            if (accessToken) {
                localStorage.setItem('accessToken', accessToken);
                localStorage.setItem('authToken', accessToken);
                localStorage.setItem('token', accessToken);
            }
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
            }

            persistResolvedCurrentUserSession({
                id: sanitizeInput(data.id || (currentUser && currentUser.id) || '', 120),
                name: sanitizeInput(data.name || (currentUser && (currentUser.name || currentUser.fullname)) || 'Customer', 140),
                fullname: sanitizeInput(data.name || (currentUser && (currentUser.fullname || currentUser.name)) || 'Customer', 140),
                email: sanitizeInput(data.email || (currentUser && currentUser.email) || '', 180),
                phone: verifiedPhone,
                mobile: verifiedPhone,
                phoneE164: verifiedPhone,
                isPhoneVerified: true,
                phoneVerified: true,
                accountType: sanitizeInput(data.accountType || (currentUser && currentUser.accountType) || 'customer', 40),
                role: sanitizeInput(data.role || (currentUser && currentUser.role) || 'user', 40)
            });
        }

        async function verifyBackendBookingPhoneOtp(normalizedPhone, otpValue) {
            const deviceFingerprint = getBookingDeviceFingerprint();
            const result = await fetchJsonAcrossApiBases('/api/auth/otp/verify', {
                method: 'POST',
                includeJson: true,
                includeIdempotency: true,
                idPrefix: 'gir-booking-phone-otp-verify',
                extraHeaders: {
                    'x-device-fingerprint': deviceFingerprint
                },
                body: {
                    channel: 'sms',
                    accountType: 'customer',
                    phone: normalizedPhone,
                    otp: otpValue,
                    deviceFingerprint
                },
                timeoutMs: 14000
            });

            const data = result.data || {};
            if (!result.ok) {
                throw new Error(sanitizeInput(data.message || result.reason || 'backend_sms_otp_verify_failed', 220));
            }

            const verifiedPhone = normalizeCustomerPhoneValue(data.phone || normalizedPhone);
            if (!verifiedPhone) {
                throw new Error('Verified phone number missing after backend OTP confirmation.');
            }

            storeBackendPhoneVerificationSession(data, verifiedPhone);
            updateCustomerAccountStoresWithPhone(verifiedPhone, true);
            clearBookingBackendOtpSession();
            clearBookingPhoneReviewFallback();
            return {
                ok: true,
                phone: verifiedPhone,
                data,
                apiBase: result.apiBase || ''
            };
        }

        function hydrateBookingPhoneVerificationUI() {
            syncBookingOtpUiState();
            const input = document.getElementById('bookingCustomerPhone');
            if (!input) return;

            const phoneMeta = resolveCurrentCustomerPhoneMeta();
            input.value = phoneMeta.localPhone || '';
            const otpInput = document.getElementById('bookingPhoneOtp');
            if (otpInput) otpInput.value = '';
            if (!BOOKING_PHONE_OTP_REQUIRED) {
                if (phoneMeta.localPhone) {
                    setBookingPhoneStatus(`Contact number ready: ${phoneMeta.localPhone}`, 'success');
                } else {
                    setBookingPhoneStatus('Contact mobile number is required for booking.');
                }
                return;
            }
            const reviewFallback = getBookingPhoneReviewFallback(phoneMeta.localPhone);
            if (phoneMeta.localPhone && phoneMeta.verified) {
                setBookingPhoneStatus(`Verified mobile ready: ${phoneMeta.localPhone}`, 'success');
            } else if (phoneMeta.localPhone && reviewFallback) {
                setBookingPhoneStatus('Phone verification service is temporarily unavailable. Please try Send OTP again in a moment or contact support.', 'error');
            } else if (phoneMeta.localPhone) {
                setBookingPhoneStatus(`Mobile saved but not verified: ${phoneMeta.localPhone}. Please send OTP and verify.`, 'error');
            } else {
                setBookingPhoneStatus('Verified mobile number is required for booking.');
            }
        }

        function handleBookingPhoneInputChange() {
            const phoneValue = sanitizeInput(document.getElementById('bookingCustomerPhone')?.value || '', 40);
            const otpInput = document.getElementById('bookingPhoneOtp');
            if (otpInput) otpInput.value = '';
            if (window.GoIndiaPhoneVerification && typeof window.GoIndiaPhoneVerification.clearSession === 'function') {
                window.GoIndiaPhoneVerification.clearSession(BOOKING_PHONE_VERIFICATION_SESSION_KEY);
            }
            clearBookingBackendOtpSession();
            clearBookingPhoneReviewFallback();
            if (!BOOKING_PHONE_OTP_REQUIRED) {
                const normalizedPhone = normalizeCustomerPhoneValue(phoneValue);
                if (normalizedPhone) {
                    setBookingPhoneStatus(`Contact number ready: ${normalizedPhone}`, 'success');
                } else if (phoneValue) {
                    setBookingPhoneStatus('Please enter a valid mobile number.', 'error');
                } else {
                    setBookingPhoneStatus('Contact mobile number is required for booking.');
                }
                return;
            }
            if (phoneValue) {
                setBookingPhoneStatus('Send OTP to verify this mobile number before booking.');
            } else {
                setBookingPhoneStatus('Verified mobile number is required for booking.');
            }
        }

        async function sendBookingPhoneOtp() {
            if (!BOOKING_PHONE_OTP_REQUIRED) {
                setBookingPhoneStatus('OTP verification is temporarily disabled. Contact number is enough for booking.', 'success');
                return;
            }
            const input = document.getElementById('bookingCustomerPhone');
            const normalizedPhone = window.GoIndiaPhoneVerification?.normalizePhone
                ? window.GoIndiaPhoneVerification.normalizePhone(input?.value || '')
                : normalizeCustomerPhoneValue(input?.value || '');
            if (!normalizedPhone) {
                setBookingPhoneStatus('Please enter a valid mobile number with country code.', 'error');
                revealBookingField('bookingCustomerPhone');
                return;
            }

            const phoneMeta = resolveCurrentCustomerPhoneMeta();
            if (phoneMeta.verified && phoneMeta.localPhone === normalizedPhone) {
                setBookingPhoneStatus(`Mobile already verified: ${normalizedPhone}`, 'success');
                return;
            }

            try {
                setBookingPhoneStatus('Sending OTP through secure SMS gateway...');
                await sendBackendBookingPhoneOtp(normalizedPhone);
                if (input) input.value = normalizedPhone;
                setBookingPhoneStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify Phone.`, 'success');
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                }
                return;
            } catch (backendFirstError) {
                const backendFirstMessage = String(backendFirstError?.message || '').trim();
                console.warn('Booking phone backend SMS OTP failed before Firebase fallback.', backendFirstError);
                if (!shouldTryFirebaseAfterBackendOtpFailure(backendFirstMessage)) {
                    if (isBookingPhoneServiceUnavailableReason(backendFirstMessage)) {
                        setBookingPhoneReviewFallback(normalizedPhone, backendFirstMessage);
                    }
                    const message = getBookingPhoneCustomerMessage(backendFirstMessage, 'OTP send failed. Please retry.');
                    setBookingPhoneStatus(message, 'error');
                    if (typeof showErrorToast === 'function') {
                        showErrorToast(message, 'Phone Verification');
                    }
                    return;
                }
            }

            if (!window.GoIndiaPhoneVerification || typeof window.GoIndiaPhoneVerification.sendOtp !== 'function') {
                try {
                    setBookingPhoneStatus('Sending OTP through secure SMS gateway...');
                    const backendResult = await sendBackendBookingPhoneOtp(normalizedPhone);
                    if (input) input.value = normalizedPhone;
                    setBookingPhoneStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify Phone.`, 'success');
                    if (typeof showSuccessToast === 'function') {
                        showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                    }
                    return;
                } catch (backendError) {
                    const rawMessage = String(backendError?.message || 'Phone verification service is still loading. Please retry in a moment.').trim();
                    if (isBookingPhoneServiceUnavailableReason(rawMessage)) {
                        setBookingPhoneReviewFallback(normalizedPhone, rawMessage);
                    }
                    const message = getBookingPhoneCustomerMessage(rawMessage);
                    setBookingPhoneStatus(message, 'error');
                    if (typeof showErrorToast === 'function') {
                        showErrorToast(message, 'Phone Verification');
                    }
                    return;
                }
            }

            try {
                setBookingPhoneStatus('Sending OTP...');
                await window.GoIndiaPhoneVerification.sendOtp(normalizedPhone, {
                    sessionKey: BOOKING_PHONE_VERIFICATION_SESSION_KEY,
                    containerId: 'bookingPhoneRecaptchaContainer'
                });
                if (input) input.value = normalizedPhone;
                setBookingPhoneStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify Phone.`, 'success');
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                }
            } catch (error) {
                const firebaseMessage = String(error?.message || 'OTP send failed. Please retry.').trim();
                console.warn('Booking phone Firebase OTP failed; trying backend SMS fallback.', error);
                try {
                    setBookingPhoneStatus('Firebase OTP unavailable. Trying secure SMS gateway...');
                    const backendResult = await sendBackendBookingPhoneOtp(normalizedPhone);
                    if (input) input.value = normalizedPhone;
                    setBookingPhoneStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify Phone.`, 'success');
                    if (typeof showSuccessToast === 'function') {
                        showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                    }
                    return;
                } catch (backendError) {
                    const backendMessage = String(backendError?.message || '').trim();
                    const rawMessage = backendMessage || firebaseMessage;
                    console.warn('Booking phone backend SMS OTP fallback failed.', backendError);
                    if (isBookingPhoneServiceUnavailableReason(rawMessage) || isBookingPhoneServiceUnavailableReason(firebaseMessage)) {
                        setBookingPhoneReviewFallback(normalizedPhone, rawMessage || firebaseMessage);
                    }
                    const message = getBookingPhoneCustomerMessage(rawMessage || firebaseMessage, 'OTP send failed. Please retry.');
                    setBookingPhoneStatus(message, 'error');
                    if (typeof showErrorToast === 'function') {
                        showErrorToast(message, 'Phone Verification');
                    }
                }
            }
        }

        async function verifyBookingPhoneOtp() {
            if (!BOOKING_PHONE_OTP_REQUIRED) {
                setBookingPhoneStatus('OTP verification is temporarily disabled. Contact number is enough for booking.', 'success');
                return;
            }
            const otpValue = sanitizeInput(document.getElementById('bookingPhoneOtp')?.value || '', 12);
            if (!otpValue) {
                setBookingPhoneStatus('Please enter the OTP code.', 'error');
                return;
            }
            const phoneInput = document.getElementById('bookingCustomerPhone');
            const normalizedPhone = window.GoIndiaPhoneVerification?.normalizePhone
                ? window.GoIndiaPhoneVerification.normalizePhone(phoneInput?.value || '')
                : normalizeCustomerPhoneValue(phoneInput?.value || '');
            const backendOtpSession = getBookingBackendOtpSession(normalizedPhone);
            if (backendOtpSession) {
                try {
                    setBookingPhoneStatus('Verifying OTP...');
                    const backendResult = await verifyBackendBookingPhoneOtp(backendOtpSession.phone, otpValue);
                    const verifiedPhone = backendResult.phone;
                    if (phoneInput) phoneInput.value = verifiedPhone;
                    setBookingPhoneStatus(`Verified mobile saved to backend: ${verifiedPhone}`, 'success');
                    if (typeof showSuccessToast === 'function') {
                        showSuccessToast(`Mobile verified: ${verifiedPhone}`, 'Phone Verification');
                    }
                    return;
                } catch (backendError) {
                    const message = getBookingPhoneCustomerMessage(backendError?.message || 'OTP verification failed. Please retry.');
                    setBookingPhoneStatus(message, 'error');
                    if (typeof showErrorToast === 'function') {
                        showErrorToast(message, 'Phone Verification');
                    }
                    return;
                }
            }
            if (!window.GoIndiaPhoneVerification || typeof window.GoIndiaPhoneVerification.verifyOtp !== 'function') {
                setBookingPhoneStatus('Phone verification service is still loading. Please retry in a moment.', 'error');
                return;
            }

            try {
                setBookingPhoneStatus('Verifying OTP...');
                const result = await window.GoIndiaPhoneVerification.verifyOtp(otpValue, {
                    sessionKey: BOOKING_PHONE_VERIFICATION_SESSION_KEY
                });
                const verifiedPhone = normalizeCustomerPhoneValue(result?.phone || document.getElementById('bookingCustomerPhone')?.value || '');
                if (!verifiedPhone) {
                    throw new Error('Verified phone number missing after OTP confirmation.');
                }

                persistResolvedCurrentUserSession({
                    phone: verifiedPhone,
                    mobile: verifiedPhone,
                    phoneE164: verifiedPhone,
                    isPhoneVerified: true,
                    phoneVerified: true
                });
                updateCustomerAccountStoresWithPhone(verifiedPhone, true);
                clearBookingBackendOtpSession();
                clearBookingPhoneReviewFallback();
                const input = document.getElementById('bookingCustomerPhone');
                if (input) input.value = verifiedPhone;

                const syncResult = await syncVerifiedPhoneWithBackend(verifiedPhone);
                if (syncResult?.ok && syncResult.data?.user) {
                    persistResolvedCurrentUserSession({
                        ...syncResult.data.user,
                        phone: normalizeCustomerPhoneValue(syncResult.data.user.phone || verifiedPhone) || verifiedPhone,
                        mobile: normalizeCustomerPhoneValue(syncResult.data.user.phone || verifiedPhone) || verifiedPhone,
                        isPhoneVerified: Boolean(syncResult.data.user.isPhoneVerified),
                        phoneVerified: Boolean(syncResult.data.user.isPhoneVerified)
                    });
                    updateCustomerAccountStoresWithPhone(verifiedPhone, Boolean(syncResult.data.user.isPhoneVerified));
                    setBookingPhoneStatus(`Verified mobile saved to backend: ${verifiedPhone}`, 'success');
                } else if (syncResult?.reason === 'missing_access_token') {
                    setBookingPhoneStatus(`Verified mobile saved in this session: ${verifiedPhone}. Backend sync will happen after login refresh.`, 'success');
                } else {
                    setBookingPhoneStatus(`Verified mobile saved locally: ${verifiedPhone}. Backend sync is pending.`, 'success');
                }

                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`Mobile verified: ${verifiedPhone}`, 'Phone Verification');
                }
            } catch (error) {
                const message = getBookingPhoneCustomerMessage(error?.message || 'OTP verification failed. Please retry.');
                setBookingPhoneStatus(message, 'error');
                if (typeof showErrorToast === 'function') {
                    showErrorToast(message, 'Phone Verification');
                }
            }
        }

        function getBackendAccessToken() {
            return (
                localStorage.getItem('accessToken') ||
                localStorage.getItem('authToken') ||
                localStorage.getItem('token') ||
                ''
            );
        }

        function getBackendRefreshToken() {
            const keys = [
                'goindiaride_refresh_token_v1',
                'goindiaride_refresh_token',
                'refreshToken'
            ];
            for (const key of keys) {
                try {
                    const value = String(localStorage.getItem(key) || '').trim();
                    if (value) return value;
                } catch (_error) {
                    // Keep scanning other token slots.
                }
            }
            return '';
        }

        function persistBackendAccessToken(token) {
            const normalized = String(token || '').trim();
            if (!normalized) return;
            ['accessToken', 'authToken', 'token'].forEach((key) => {
                try {
                    localStorage.setItem(key, normalized);
                } catch (_error) {
                    // Ignore storage restrictions.
                }
            });
        }

        function persistBackendRefreshToken(token) {
            const normalized = String(token || '').trim();
            if (!normalized) return;
            ['goindiaride_refresh_token_v1', 'goindiaride_refresh_token', 'refreshToken'].forEach((key) => {
                try {
                    localStorage.setItem(key, normalized);
                } catch (_error) {
                    // Ignore storage restrictions.
                }
            });
        }

        function clearBackendAccessTokens() {
            ['accessToken', 'authToken', 'token'].forEach((key) => {
                try {
                    localStorage.removeItem(key);
                } catch (_error) {
                    // Ignore storage restrictions.
                }
            });
        }

        function decodeBookingJwtPayload(token) {
            const parts = String(token || '').split('.');
            if (parts.length < 2) return null;
            try {
                const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
                return JSON.parse(atob(padded));
            } catch (_error) {
                return null;
            }
        }

        function isBackendAccessTokenExpired(token, skewMs = 60000) {
            const payload = decodeBookingJwtPayload(token);
            if (!payload || !payload.exp) return false;
            return (Number(payload.exp) * 1000) <= Date.now() + Number(skewMs || 0);
        }

        function isBookingAuthFailureReason(reason, status = 0) {
            const text = String(reason || '').toLowerCase();
            return Number(status || 0) === 401
                || text.includes('invalid or expired token')
                || text.includes('jwt expired')
                || text.includes('token expired')
                || text.includes('invalid token')
                || text.includes('missing_access_token')
                || text.includes('unauthorized');
        }

        async function refreshBookingBackendAccessToken(reason = 'booking_submit') {
            if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.restorePortalSession === 'function') {
                try {
                    const restored = await window.GoIndiaSessionContinuity.restorePortalSession({
                        role: 'customer',
                        preferFastLocal: false,
                        backgroundRefresh: false
                    });
                    const restoredToken = String(getBackendAccessToken() || '').trim();
                    if (restored?.ok && restoredToken && !isBackendAccessTokenExpired(restoredToken)) {
                        return { ok: true, token: restoredToken, source: restored.source || 'session_continuity' };
                    }
                } catch (_error) {
                    // Fall through to direct refresh endpoint.
                }
            }

            const refreshToken = getBackendRefreshToken();
            if (!refreshToken) {
                return { ok: false, reason: 'missing_refresh_token' };
            }

            const apiBases = getBackendApiBaseCandidates();
            const deviceFingerprint = getBookingDeviceFingerprint();
            const paths = ['/api/auth/refresh-secure', '/api/auth/refresh-token', '/api/auth/refresh-token-v2'];
            const attempts = [];
            for (const apiBase of apiBases) {
                if (isApiBaseQuarantined(apiBase)) {
                    attempts.push({ apiBase, status: 0, reason: 'api_base_quarantined' });
                    continue;
                }
                for (const path of paths) {
                    try {
                        const response = await fetchWithTimeout(`${apiBase}${path}`, {
                            method: 'POST',
                            credentials: 'include',
                            cache: 'no-store',
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'X-Refresh-Token': refreshToken,
                                'X-Device-Fingerprint': deviceFingerprint,
                                'x-request-id': createClientRequestId('gir-booking-token-refresh'),
                                'x-timestamp': String(Date.now())
                            },
                            body: JSON.stringify({
                                refreshToken,
                                deviceFingerprint,
                                reason: sanitizeInput(reason || 'booking_submit', 120)
                            })
                        }, 9000);
                        const data = await parseJsonSafe(response);
                        if (response.status === 404 || response.status === 405) {
                            attempts.push({ apiBase, path, status: response.status, reason: 'refresh_endpoint_unavailable' });
                            continue;
                        }
                        if (!response.ok || !data?.accessToken) {
                            attempts.push({
                                apiBase,
                                path,
                                status: Number(response.status || 0),
                                reason: sanitizeInput(data?.message || data?.reason || 'refresh_failed', 140)
                            });
                            continue;
                        }
                        persistBackendAccessToken(data.accessToken);
                        if (data.refreshToken) persistBackendRefreshToken(data.refreshToken);
                        if (apiBase) {
                            try {
                                localStorage.setItem('goindiaride_api_base', apiBase);
                            } catch (_error) {
                                // Ignore storage restrictions.
                            }
                        }
                        return { ok: true, token: String(data.accessToken || '').trim(), apiBase, path };
                    } catch (error) {
                        attempts.push({
                            apiBase,
                            path,
                            status: 0,
                            reason: classifyBrowserRequestFailure(apiBase, error)
                        });
                    }
                }
            }

            return {
                ok: false,
                reason: attempts.length ? attempts[attempts.length - 1].reason : 'refresh_failed',
                attempts
            };
        }

        async function resolveFreshBookingAccessToken(reason = 'booking_submit') {
            const token = String(getBackendAccessToken() || '').trim();
            if (token && !isBackendAccessTokenExpired(token)) {
                return { ok: true, token, source: 'stored_access_token' };
            }
            const refreshed = await refreshBookingBackendAccessToken(reason);
            if (refreshed.ok && refreshed.token) {
                return refreshed;
            }
            if (token && !isBackendAccessTokenExpired(token, 0)) {
                return { ok: true, token, source: 'stored_access_token_unverified' };
            }
            clearBackendAccessTokens();
            return refreshed.ok ? refreshed : { ok: false, reason: refreshed.reason || 'missing_or_expired_access_token' };
        }

        async function warmBookingBackendConnections() {
            const candidates = getBackendApiBaseCandidates().slice(0, 2);
            await Promise.allSettled(candidates.map(async (apiBase) => {
                try {
                    await fetchWithTimeout(`${apiBase}/health`, {
                        method: 'GET',
                        headers: {
                            Accept: 'application/json'
                        }
                    }, 20000);
                } catch (_error) {
                    // Warmup is best-effort only.
                }
            }));
        }

        function createClientRequestId(prefix = 'gir-booking') {
            return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        }

        function createIdempotencyKey(prefix = 'gir-booking') {
            return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 15)}`;
        }

        function buildSecureApiHeaders({
            token = '',
            includeJson = true,
            includeIdempotency = false,
            idPrefix = 'gir-booking',
            idempotencyKey = ''
        } = {}) {
            const headers = {
                Accept: 'application/json',
                'x-request-id': createClientRequestId(idPrefix),
                'x-timestamp': String(Date.now())
            };

            if (includeJson) {
                headers['Content-Type'] = 'application/json';
            }

            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            if (includeIdempotency) {
                headers['x-idempotency-key'] = idempotencyKey || createIdempotencyKey(idPrefix);
            }

            return headers;
        }

        function createStableFallbackEmailIdempotencyKey(bookingId) {
            const safeBookingId = sanitizeInput(bookingId || '', 120).replace(/[^A-Za-z0-9:_-]/g, '_');
            if (!safeBookingId) {
                return createIdempotencyKey('gir-booking-fallback-email');
            }
            return `gir-booking-fallback-email:${safeBookingId}:admin-alert`;
        }

        function createAdminReviewQueueIdempotencyKey(bookingId) {
            const safeBookingId = sanitizeInput(bookingId || '', 120).replace(/[^A-Za-z0-9:_-]/g, '_');
            const prefix = safeBookingId ? `gir-booking-admin-review-queue:${safeBookingId}` : 'gir-booking-admin-review-queue';
            return createIdempotencyKey(prefix);
        }

        function broadcastAdminReviewQueueSync(bookingId, details = {}) {
            const safeBookingId = sanitizeInput(bookingId || '', 120);
            if (!safeBookingId) return;
            try {
                localStorage.setItem(ADMIN_REVIEW_QUEUE_SIGNAL_KEY, JSON.stringify({
                    bookingId: safeBookingId,
                    apiBase: sanitizeInput(details.apiBase || '', 240),
                    state: sanitizeInput(details.state || 'queued', 80),
                    reason: sanitizeInput(details.reason || 'customer_booking_submit', 140),
                    updatedAt: new Date().toISOString()
                }));
            } catch (_error) {
                // Storage can be unavailable in strict/private browser modes.
            }
        }

        function isDuplicateIdempotencyConflictResponse(statusCode, payload = {}) {
            if (Number(statusCode || 0) !== 409) return false;
            const reasonText = String(payload?.reason || payload?.message || '').toLowerCase();
            return (
                reasonText.includes('duplicate idempotency request blocked')
                || reasonText.includes('request with same idempotency key is already in progress')
                || reasonText.includes('idempotency key already used')
            );
        }

        async function parseJsonSafe(response) {
            try {
                return await response.json();
            } catch (_error) {
                return {};
            }
        }

        async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort('request_timeout'), timeoutMs);
            try {
                return await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
            } catch (error) {
                if (controller.signal && controller.signal.aborted) {
                    const abortReason = controller.signal.reason;
                    const reasonText =
                        typeof abortReason === 'string'
                            ? abortReason
                            : sanitizeInput(abortReason && abortReason.message, 140) || 'request_timeout';
                    throw new Error(reasonText);
                }
                throw error;
            } finally {
                clearTimeout(timer);
            }
        }

        function formatApiReason(message, fallback = 'request_failed') {
            const safe = sanitizeInput(message || '', 160);
            return safe || fallback;
        }

        function isCrossOriginApiBase(apiBase) {
            try {
                return new URL(String(apiBase || '')).origin !== window.location.origin;
            } catch (_error) {
                return false;
            }
        }

        function classifyBrowserRequestFailure(apiBase, error) {
            const rawMessage = String((error && error.message) || error || '').trim();
            const normalized = rawMessage.toLowerCase();

            if (normalized.includes('request_timeout') || normalized.includes('timeout')) {
                return 'request_timeout';
            }

            if (
                normalized.includes('failed to fetch') ||
                normalized.includes('load failed') ||
                normalized.includes('networkerror') ||
                normalized.includes('network request failed')
            ) {
                return isCrossOriginApiBase(apiBase) ? 'preflight_blocked' : 'network_error';
            }

            return formatApiReason(rawMessage || 'network_error', 'network_error');
        }

        async function fetchJsonAcrossApiBases(pathname, {
            method = 'GET',
            token = '',
            body = null,
            includeJson = true,
            includeIdempotency = false,
            idPrefix = 'gir-api',
            idempotencyKey = '',
            extraHeaders = {},
            timeoutMs = 8000,
            retryStatuses = [404, 405, 408, 429, 500, 502, 503, 504]
        } = {}) {
            const path = String(pathname || '').trim();
            if (!path) {
                return {
                    ok: false,
                    reason: 'missing_pathname',
                    attempts: []
                };
            }

            const apiBases = getBackendApiBaseCandidates();
            if (!apiBases.length) {
                return {
                    ok: false,
                    status: 0,
                    apiBase: '',
                    reason: 'no_available_api_base_candidates',
                    attempts: []
                };
            }
            const attempts = [];
            for (const apiBase of apiBases) {
                if (isApiBaseQuarantined(apiBase)) {
                    attempts.push({
                        apiBase,
                        status: 0,
                        reason: 'api_base_quarantined'
                    });
                    continue;
                }

                const url = `${apiBase}${path}`;
                try {
                    const response = await fetchWithTimeout(url, {
                        method,
                        headers: {
                            ...buildSecureApiHeaders({
                                token,
                                includeJson,
                                includeIdempotency,
                                idPrefix,
                                idempotencyKey
                            }),
                            ...extraHeaders
                        },
                        body: body != null ? JSON.stringify(body) : undefined
                    }, timeoutMs);

                    const data = await parseJsonSafe(response);
                    if (response.ok) {
                        clearApiBaseQuarantine(apiBase);
                        return {
                            ok: true,
                            status: Number(response.status || 200),
                            apiBase,
                            data,
                            attempts
                        };
                    }

                    const reason = formatApiReason(data?.message || data?.reason || `http_${response.status}`, `http_${response.status}`);
                    const statusCode = Number(response.status || 0);
                    if (shouldQuarantineApiBase(apiBase, statusCode, reason)) {
                        const ttlMs = statusCode === 404 || statusCode === 405
                            ? API_BASE_QUARANTINE_STATIC_MS
                            : API_BASE_QUARANTINE_DEFAULT_MS;
                        quarantineApiBase(apiBase, reason, statusCode, ttlMs);
                    }
                    attempts.push({
                        apiBase,
                        status: statusCode,
                        reason
                    });

                    if (retryStatuses.includes(statusCode)) {
                        continue;
                    }

                    return {
                        ok: false,
                        status: statusCode,
                        apiBase,
                        reason,
                        data,
                        attempts
                    };
                } catch (error) {
                    const reason = classifyBrowserRequestFailure(apiBase, error);
                    if (shouldQuarantineApiBase(apiBase, 0, reason)) {
                        quarantineApiBase(apiBase, reason, 0, API_BASE_QUARANTINE_DNS_MS);
                    }
                    attempts.push({
                        apiBase,
                        status: 0,
                        reason
                    });
                }
            }

            const last = attempts.length ? attempts[attempts.length - 1] : null;
            return {
                ok: false,
                status: last ? Number(last.status || 0) : 0,
                apiBase: last ? last.apiBase : '',
                reason: last ? last.reason : 'all_api_candidates_failed',
                attempts
            };
        }

        const DRIVER_AUTO_ASSIGN_ENABLED = false; // Temporarily disabled: admin-first live booking flow.
        const BOOKING_STRICT_LIVE_MODE = window.__GOINDIARIDE_BOOKING_STRICT_LIVE__ !== false;
        const API_BASE_QUARANTINE_KEY = 'goindiaride_api_base_quarantine_v1';
        const API_BASE_QUARANTINE_DEFAULT_MS = 45 * 60 * 1000;
        const API_BASE_QUARANTINE_STATIC_MS = 6 * 60 * 60 * 1000;
        const API_BASE_QUARANTINE_DNS_MS = 20 * 60 * 1000;
        const ADMIN_EMAIL_RETRY_QUEUE_KEY = 'goindiaride_admin_email_retry_queue_v1';
        const ADMIN_EMAIL_RETRY_COOLDOWN_KEY = 'goindiaride_admin_email_retry_cooldown_v1';
        const ADMIN_EMAIL_RETRY_MAX_ITEMS = 120;
        const ADMIN_EMAIL_RETRY_MAX_ATTEMPTS = 20;
        const ADMIN_EMAIL_RETRY_BATCH_SIZE = 4;
        const ADMIN_EMAIL_RETRY_BASE_DELAY_MS = 20 * 1000;
        const ADMIN_EMAIL_RETRY_MAX_DELAY_MS = 30 * 60 * 1000;
        const ADMIN_EMAIL_RETRY_THROTTLE_COOLDOWN_MS = 5 * 60 * 1000;
        const LAST_ADMIN_EMAIL_DISPATCH_KEY = 'goindiaride_last_admin_email_dispatch_v1';
        const ADMIN_REVIEW_INBOX_KEY = 'goindiaride_admin_review_inbox_v1';
        const CUSTOMER_BOOKING_LOCAL_STORE_KEYS = [
            'bookings',
            'goride_bookings',
            'goindiaride_active_bookings',
            'customerBookings',
            'customer_bookings',
            'goindiaride_live_customer_booking_queue_v1'
        ];
        let bookingSubmitInProgress = false;
        let adminEmailRetryIntervalRef = null;
        let adminEmailFlushInProgress = false;

        function readBookingStoreArray(key) {
            try {
                const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
            } catch (_error) {
                return [];
            }
        }

        function mergeBookingCollections(baseItems, incomingItems) {
            const merged = new Map();
            [...(Array.isArray(baseItems) ? baseItems : []), ...(Array.isArray(incomingItems) ? incomingItems : [])].forEach((item) => {
                if (!item || typeof item !== 'object') return;
                const bookingId = String(item.id || item.bookingId || '').trim();
                if (!bookingId) return;
                const existing = merged.get(bookingId) || {};
                merged.set(bookingId, {
                    ...existing,
                    ...item,
                    id: bookingId,
                    bookingId
                });
            });
            return Array.from(merged.values())
                .sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || '')));
        }

        function persistBookingStore(bookings) {
            const normalized = Array.isArray(bookings)
                ? bookings.filter((item) => item && typeof item === 'object')
                : [];
            CUSTOMER_BOOKING_LOCAL_STORE_KEYS.forEach((key) => {
                const mergedRows = mergeBookingCollections(readBookingStoreArray(key), normalized);
                localStorage.setItem(key, JSON.stringify(mergedRows));
            });
        }

        function loadAdminReviewInboxStore() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ADMIN_REVIEW_INBOX_KEY) || '[]');
                return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
            } catch (_error) {
                return [];
            }
        }

        function saveAdminReviewInboxStore(items) {
            const normalized = Array.isArray(items)
                ? items.filter((item) => item && typeof item === 'object')
                : [];
            localStorage.setItem(ADMIN_REVIEW_INBOX_KEY, JSON.stringify(normalized));
        }

        function mergeEmailDispatchState(existingValue, updates = {}) {
            const base = existingValue && typeof existingValue === 'object' ? existingValue : {};
            const next = updates && typeof updates === 'object' ? updates : {};
            const merged = {
                ...base,
                ...next
            };

            if (!merged.state) {
                merged.state = 'pending';
            }

            if (!merged.updatedAt) {
                merged.updatedAt = new Date().toISOString();
            }

            return merged;
        }

        function resolveEmailDispatchState(result, fallbackState = 'pending', fallbackReason = '') {
            const updatedAt = new Date().toISOString();
            if (!result || typeof result !== 'object') {
                return {
                    state: fallbackState || 'pending',
                    reason: sanitizeInput(fallbackReason || '', 140),
                    updatedAt
                };
            }

            if (result.sent === true) {
                return {
                    state: 'sent',
                    reason: '',
                    recipients: Number(result.recipients || 0) || 0,
                    updatedAt
                };
            }

            if (result.queued === true || result.reason === 'queued_background_send') {
                return {
                    state: 'queued',
                    reason: sanitizeInput(result.reason || 'queued_background_send', 140),
                    updatedAt
                };
            }

            if (result.reason === 'same_as_admin_recipient') {
                return {
                    state: 'skipped',
                    reason: 'same_as_admin_recipient',
                    updatedAt
                };
            }

            return {
                state: fallbackState || 'pending',
                reason: sanitizeInput(result.reason || result.message || fallbackReason || 'pending', 140),
                updatedAt
            };
        }

        function upsertAdminReviewInboxEntry(bookingRecord, extra = {}) {
            if (!bookingRecord || typeof bookingRecord !== 'object') return null;
            const bookingId = String(bookingRecord.id || bookingRecord.bookingId || extra.bookingId || '').trim();
            if (!bookingId) return null;

            const items = loadAdminReviewInboxStore();
            const idx = items.findIndex((item) => String(item.id || item.bookingId || '').trim() === bookingId);
            const existing = idx >= 0 ? items[idx] : {};
            const normalized = {
                ...existing,
                ...bookingRecord,
                ...extra,
                id: bookingId,
                bookingId,
                status: bookingRecord.status || extra.status || existing.status || 'pending_admin_review',
                adminReviewStatus: bookingRecord.adminReviewStatus || extra.adminReviewStatus || existing.adminReviewStatus || 'pending',
                createdAt: bookingRecord.createdAt || extra.createdAt || existing.createdAt || new Date().toISOString(),
                adminEmailDispatch: mergeEmailDispatchState(
                    existing.adminEmailDispatch,
                    bookingRecord.adminEmailDispatch || extra.adminEmailDispatch || {}
                ),
                customerEmailDispatch: mergeEmailDispatchState(
                    existing.customerEmailDispatch,
                    bookingRecord.customerEmailDispatch || extra.customerEmailDispatch || {}
                )
            };

            if (idx >= 0) {
                items[idx] = normalized;
            } else {
                items.unshift(normalized);
            }

            saveAdminReviewInboxStore(items);
            return normalized;
        }

        function updateBookingDeliveryState(bookingId, updates = {}) {
            const safeBookingId = String(bookingId || '').trim();
            if (!safeBookingId) return null;

            let mergedRecord = null;
            let bookings = [];
            try {
                const parsed = JSON.parse(localStorage.getItem('bookings') || '[]');
                bookings = Array.isArray(parsed) ? parsed : [];
            } catch (_error) {
                bookings = [];
            }

            const idx = bookings.findIndex((item) => String(item.id || item.bookingId || '').trim() === safeBookingId);
            if (idx >= 0) {
                const existing = bookings[idx] || {};
                mergedRecord = {
                    ...existing,
                    ...updates,
                    id: safeBookingId,
                    bookingId: safeBookingId,
                    adminEmailDispatch: mergeEmailDispatchState(existing.adminEmailDispatch, updates.adminEmailDispatch || {}),
                    customerEmailDispatch: mergeEmailDispatchState(existing.customerEmailDispatch, updates.customerEmailDispatch || {})
                };
                bookings[idx] = mergedRecord;
                persistBookingStore(bookings);
            }

            const inboxSeed = mergedRecord || {
                id: safeBookingId,
                bookingId: safeBookingId,
                ...updates
            };

            return upsertAdminReviewInboxEntry(inboxSeed);
        }

        function upsertBookingInLocalStore(bookingRecord) {
            const bookingId = String(bookingRecord.id || bookingRecord.bookingId || '').trim();
            if (!bookingId) return null;

            const normalized = {
                ...bookingRecord,
                id: bookingId,
                bookingId: bookingId,
                status: bookingRecord.status === 'pending' ? 'pending_admin_review' : (bookingRecord.status || 'pending_admin_review'),
                adminReviewStatus: bookingRecord.adminReviewStatus || 'pending',
                adminBookingScope: bookingRecord.adminBookingScope || 'customer',
                sourceKey: bookingRecord.sourceKey || 'customer_booking_submit',
                pickupLocation: bookingRecord.pickupLocation || bookingRecord.pickup || '',
                dropoff: bookingRecord.dropoff || bookingRecord.drop || bookingRecord.dropLocation || '',
                drop: bookingRecord.drop || bookingRecord.dropoff || bookingRecord.dropLocation || '',
                dropLocation: bookingRecord.dropLocation || bookingRecord.dropoff || bookingRecord.drop || '',
                totalFare: Number(bookingRecord.totalFare || bookingRecord.amount || bookingRecord.fare || 0),
                amount: Number(bookingRecord.amount || bookingRecord.totalFare || bookingRecord.fare || 0),
                customerSnapshot: {
                    name: sanitizeInput(bookingRecord.customerSnapshot?.name || bookingRecord.customerName || 'Customer', 140),
                    email: sanitizeInput(bookingRecord.customerSnapshot?.email || bookingRecord.customerEmail || '', 180),
                    phone: sanitizeInput(bookingRecord.customerSnapshot?.phone || bookingRecord.customerPhone || '', 40)
                },
                createdAt: bookingRecord.createdAt || new Date().toISOString(),
                adminEmailDispatch: mergeEmailDispatchState(
                    bookingRecord.adminEmailDispatch,
                    bookingRecord.adminEmailDispatch || {}
                ),
                customerEmailDispatch: mergeEmailDispatchState(
                    bookingRecord.customerEmailDispatch,
                    bookingRecord.customerEmailDispatch || {}
                )
            };

            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const existingIdx = bookings.findIndex((item) => String(item.id || item.bookingId || '') === bookingId);

            if (existingIdx === -1) {
                bookings.unshift(normalized);
            } else {
                bookings[existingIdx] = { ...bookings[existingIdx], ...normalized };
            }

            persistBookingStore(bookings);
            upsertAdminReviewInboxEntry(normalized);
            return normalized;
        }

        function notifyAdminBookingReviewRequired(bookingRecord) {
            const safeBookingId = String(bookingRecord.id || bookingRecord.bookingId || '').trim();
            if (!safeBookingId || !window.PortalConnector || typeof PortalConnector.createNotification !== 'function') {
                return;
            }

            PortalConnector.createNotification({
                type: 'booking_pending_admin_review',
                title: 'New Booking for Admin Review',
                message: `Booking ${safeBookingId} submitted by ${sanitizeInput(bookingRecord.customerName || 'customer')}.`,
                booking: bookingRecord,
                sourcePortal: 'customer',
                targetPortals: ['admin'],
                metadata: {
                    stage: 'pending_admin_review',
                    bookingId: safeBookingId,
                    customerId: bookingRecord.customerId || null,
                    mode: bookingRecord.mode || 'local_fallback'
                }
            });
        }

        function renderBookingSubmissionSuccess(bookingId, toastMessage) {
            document.getElementById('bookingReference').textContent = `Reference: #${bookingId} | Admin approval pending`;
            document.getElementById('matchingCard').style.display = 'none';
            document.getElementById('driverDetails').classList.remove('show');
            document.getElementById('successModal').classList.add('active');
        }

        function queueBookingForAdminReview(booking, mode, backendStatus, toastMessage) {
            const normalized = upsertBookingInLocalStore({
                ...booking,
                id: sanitizeInput(booking.id || booking.bookingId || (`RID${Date.now()}`)),
                bookingId: sanitizeInput(booking.bookingId || booking.id || (`RID${Date.now()}`)),
                mode: mode || booking.mode || 'local_secure_fallback',
                backendStatus: backendStatus || booking.backendStatus || 'queued_local_fallback',
                status: booking.status || 'pending_admin_review',
                adminReviewStatus: booking.adminReviewStatus || 'pending',
                createdAt: new Date().toISOString(),
                adminEmailDispatch: booking.adminEmailDispatch || {
                    state: 'pending',
                    reason: sanitizeInput(backendStatus || 'queued_local_fallback', 140),
                    updatedAt: new Date().toISOString()
                },
                customerEmailDispatch: booking.customerEmailDispatch || {
                    state: 'pending',
                    reason: 'awaiting_dispatch',
                    updatedAt: new Date().toISOString()
                }
            });

            if (!normalized) return null;
            notifyAdminBookingReviewRequired(normalized);
            renderBookingSubmissionSuccess(normalized.id, toastMessage);
            return normalized;
        }

        async function submitBookingThroughAdminReviewFallback(booking, reason = 'customer_booking_submit', options = {}) {
            const fallbackReason = sanitizeInput(reason || 'customer_booking_submit', 140);
            const mode = sanitizeInput(options.mode || 'local_secure_fallback', 80);
            const toastMessage = sanitizeInput(
                options.toastMessage || `Booking ${booking?.bookingId || booking?.id || ''} submitted for admin review.`,
                220
            );

            if (options.clearAccessToken === true) {
                clearBackendAccessTokens();
            }

            const queuedBooking = queueBookingForAdminReview(
                booking,
                mode,
                fallbackReason,
                toastMessage
            );

            if (!queuedBooking) {
                showError('Booking failed. Please try again.');
                return { ok: false, reason: 'queue_booking_failed' };
            }

            const queueResult = await queueBookingRecordForBackendAdminReview(queuedBooking, fallbackReason);
            if (!queueResult.ok) {
                console.warn('Admin review queue sync pending:', queueResult.reason || 'queue_failed');
            }

            const emailResult = await sendAdminEmailForQueuedBooking(queuedBooking, fallbackReason);
            if (emailResult.ok) {
                removeAdminEmailRetry(emailResult.bookingId || queuedBooking.id);
                handleBookingEmailDispatchFeedback(emailResult);
            } else {
                const pendingReason = getAdminEmailPendingReason(emailResult);
                handleBookingEmailDispatchFeedback(emailResult, { silentAdminToast: true });
                enqueueAdminEmailRetry(queuedBooking, pendingReason);
            }

            return {
                ok: true,
                bookingId: queuedBooking.id || queuedBooking.bookingId,
                queueResult,
                emailResult
            };
        }

        function handleBookingEmailDispatchFeedback(emailResult, { silentAdminToast = false } = {}) {
            if (!emailResult || typeof emailResult !== 'object') return;

            if (emailResult.bookingId) {
                updateBookingDeliveryState(emailResult.bookingId, {
                    adminEmailDispatch: resolveEmailDispatchState(
                        emailResult.adminEmail,
                        emailResult.ok ? 'sent' : 'pending',
                        emailResult.reason || 'admin_email_pending'
                    ),
                    customerEmailDispatch: resolveEmailDispatchState(
                        emailResult.customerEmail,
                        'pending',
                        emailResult.reason || 'customer_email_pending'
                    ),
                    lastEmailDispatchAt: new Date().toISOString()
                });
            }

            // Customer booking page should only show the booking success modal.
            // Keep delivery state updates, but suppress background email-status toasts here.
        }

        function loadAdminEmailRetryQueue() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ADMIN_EMAIL_RETRY_QUEUE_KEY) || '[]');
                if (!Array.isArray(parsed)) return [];
                return parsed.filter((item) => item && typeof item === 'object').slice(0, ADMIN_EMAIL_RETRY_MAX_ITEMS);
            } catch (_error) {
                return [];
            }
        }

        function saveAdminEmailRetryQueue(items) {
            const queue = Array.isArray(items) ? items.slice(0, ADMIN_EMAIL_RETRY_MAX_ITEMS) : [];
            localStorage.setItem(ADMIN_EMAIL_RETRY_QUEUE_KEY, JSON.stringify(queue));
        }

        function removeAdminEmailRetry(bookingId) {
            const safeBookingId = sanitizeInput(bookingId || '', 120);
            if (!safeBookingId) return;
            const filtered = loadAdminEmailRetryQueue().filter((item) => sanitizeInput(item.bookingId || '', 120) !== safeBookingId);
            saveAdminEmailRetryQueue(filtered);
        }

        function readAdminEmailCooldown() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ADMIN_EMAIL_RETRY_COOLDOWN_KEY) || '{}');
                if (!parsed || typeof parsed !== 'object') return { untilMs: 0, reason: '' };
                return {
                    untilMs: Number(parsed.untilMs || 0),
                    reason: sanitizeInput(parsed.reason || '', 140)
                };
            } catch (_error) {
                return { untilMs: 0, reason: '' };
            }
        }

        function clearAdminEmailCooldown() {
            localStorage.removeItem(ADMIN_EMAIL_RETRY_COOLDOWN_KEY);
        }

        function setAdminEmailCooldown(delayMs, reason = '') {
            const now = Date.now();
            const normalizedDelay = Math.max(30 * 1000, Math.min(Number(delayMs || 0), ADMIN_EMAIL_RETRY_MAX_DELAY_MS));
            const nextState = {
                untilMs: now + normalizedDelay,
                reason: sanitizeInput(reason || 'retry_cooldown', 140),
                updatedAt: new Date(now).toISOString()
            };
            localStorage.setItem(ADMIN_EMAIL_RETRY_COOLDOWN_KEY, JSON.stringify(nextState));
            return nextState.untilMs;
        }

        function parseRetryTimestamp(value) {
            const text = String(value || '').trim();
            if (!text) return 0;
            const time = Date.parse(text);
            return Number.isFinite(time) ? time : 0;
        }

        function isAdminEmailRateLimited(result = {}) {
            const directStatus = Number(result.status || 0);
            if (directStatus === 429) return true;
            const attempts = Array.isArray(result.attempts) ? result.attempts : [];
            if (attempts.some((attempt) => Number(attempt && attempt.status || 0) === 429)) return true;
            const reason = String(result.reason || '').toLowerCase();
            return reason.includes('http_429') || reason.includes('too many');
        }

        function nextRetryDelayMs(retryCount, reason = '', isRateLimited = false) {
            if (isRateLimited) return ADMIN_EMAIL_RETRY_THROTTLE_COOLDOWN_MS;
            const normalizedRetry = Math.max(0, Math.min(Number(retryCount || 0), 10));
            const expDelay = ADMIN_EMAIL_RETRY_BASE_DELAY_MS * Math.pow(2, normalizedRetry);
            const capped = Math.min(expDelay, ADMIN_EMAIL_RETRY_MAX_DELAY_MS);
            const hint = String(reason || '').toLowerCase();
            if (hint.includes('api_proxy_not_configured_405') || hint.includes('api_route_missing_404') || hint.includes('http_405') || hint.includes('http_404')) {
                return Math.min(capped, 15 * 60 * 1000);
            }
            if (hint.includes('api_domain_unreachable') || hint.includes('resolve') || hint.includes('dns') || hint.includes('network')) {
                return Math.min(capped, 10 * 60 * 1000);
            }
            if (hint.includes('network') || hint.includes('timeout') || hint.includes('abort')) {
                return Math.min(capped, 5 * 60 * 1000);
            }
            return capped;
        }

        function enqueueAdminEmailRetry(bookingRecord, reason = 'retry_queued') {
            if (!bookingRecord || typeof bookingRecord !== 'object') return;
            const bookingId = sanitizeInput(bookingRecord.id || bookingRecord.bookingId || '');
            if (!bookingId) return;

            const queue = loadAdminEmailRetryQueue();
            const existingIdx = queue.findIndex((item) => sanitizeInput(item.bookingId || '') === bookingId);
            const payload = {
                bookingId,
                bookingRecord,
                reason: sanitizeInput(reason || 'retry_queued', 120),
                retryCount: existingIdx >= 0 ? Number(queue[existingIdx].retryCount || 0) : 0,
                nextAttemptAt: existingIdx >= 0 ? queue[existingIdx].nextAttemptAt : new Date().toISOString(),
                createdAt: existingIdx >= 0 ? queue[existingIdx].createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (existingIdx >= 0) {
                queue[existingIdx] = {
                    ...queue[existingIdx],
                    ...payload
                };
            } else {
                queue.unshift(payload);
            }

            saveAdminEmailRetryQueue(queue);
        }

        async function flushAdminEmailRetryQueue({ silent = true } = {}) {
            if (adminEmailFlushInProgress) return;
            const queue = loadAdminEmailRetryQueue();
            if (!queue.length) return;

            const now = Date.now();
            const cooldown = readAdminEmailCooldown();
            if (cooldown.untilMs > now) {
                return;
            }

            adminEmailFlushInProgress = true;
            const remaining = [];
            try {
                const sortedQueue = [...queue].sort((a, b) => {
                    const aDue = parseRetryTimestamp(a && a.nextAttemptAt);
                    const bDue = parseRetryTimestamp(b && b.nextAttemptAt);
                    if (aDue !== bDue) return aDue - bDue;
                    const aUpdated = parseRetryTimestamp(a && a.updatedAt);
                    const bUpdated = parseRetryTimestamp(b && b.updatedAt);
                    return aUpdated - bUpdated;
                });

                let processed = 0;
                for (const item of sortedQueue) {
                    const safeBooking = item && item.bookingRecord ? item.bookingRecord : null;
                    if (!safeBooking) continue;

                    const retryCount = Number(item.retryCount || 0);
                    if (retryCount >= ADMIN_EMAIL_RETRY_MAX_ATTEMPTS) {
                        continue;
                    }

                    const dueAtMs = parseRetryTimestamp(item.nextAttemptAt);
                    if (dueAtMs > now) {
                        remaining.push(item);
                        continue;
                    }

                    if (processed >= ADMIN_EMAIL_RETRY_BATCH_SIZE) {
                        remaining.push(item);
                        continue;
                    }
                    processed += 1;

                    const result = await sendAdminEmailForQueuedBooking(
                        safeBooking,
                        sanitizeInput(item.reason || 'retry_queued', 120)
                    );

                    if (result.ok) {
                        clearAdminEmailCooldown();
                        continue;
                    }

                    const reason = sanitizeInput(result.reason || 'retry_failed', 140);
                    const rateLimited = isAdminEmailRateLimited(result);
                    const delayMs = nextRetryDelayMs(retryCount + 1, reason, rateLimited);
                    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
                    if (rateLimited) {
                        setAdminEmailCooldown(ADMIN_EMAIL_RETRY_THROTTLE_COOLDOWN_MS, reason);
                    }

                    remaining.push({
                        ...item,
                        retryCount: retryCount + 1,
                        lastReason: reason,
                        nextAttemptAt,
                        updatedAt: new Date().toISOString(),
                        customerEmail: result.customerEmail || item.customerEmail || null
                    });
                }

                saveAdminEmailRetryQueue(remaining);
            } finally {
                adminEmailFlushInProgress = false;
            }
        }

        function buildAdminReviewQueuePayload(bookingRecord, reason = 'customer_booking_submit') {
            const bookingId = sanitizeInput(bookingRecord.id || bookingRecord.bookingId || '', 120);
            if (!bookingId) return null;

            const customerPhoneMeta = resolveCurrentCustomerPhoneMeta();
            const resolvedCustomerPhone = sanitizeInput(
                bookingRecord.customerPhone || customerPhoneMeta.displayPhone || customerPhoneMeta.localPhone || '',
                40
            );
            const pickupValue = sanitizeInput(bookingRecord.pickup || bookingRecord.pickupLocation || '', 180);
            const dropValue = sanitizeInput(bookingRecord.dropoff || bookingRecord.drop || bookingRecord.dropLocation || '', 180);

            return {
                ...bookingRecord,
                id: bookingId,
                bookingId,
                customerId: sanitizeInput(bookingRecord.customerId || (currentUser && currentUser.id) || '', 120),
                customerName: sanitizeInput(bookingRecord.customerName || (currentUser && (currentUser.fullname || currentUser.name)) || 'Customer', 140),
                customerEmail: sanitizeInput(bookingRecord.customerEmail || resolveCurrentCustomerEmail() || '', 180),
                customerPhone: resolvedCustomerPhone,
                pickup: pickupValue,
                pickupLocation: pickupValue,
                pickupCoordinates: bookingRecord.pickupCoordinates || bookingRecord.locationPins?.pickup?.coordinates || bookingRecord.customerFeatures?.pickupCoordinates || null,
                pickupGoogleMapsUrl: sanitizeInput(bookingRecord.pickupGoogleMapsUrl || bookingRecord.locationPins?.pickup?.googleMapsUrl || '', 240),
                dropoff: dropValue,
                drop: dropValue,
                dropLocation: dropValue,
                dropoffCoordinates: bookingRecord.dropoffCoordinates || bookingRecord.locationPins?.dropoff?.coordinates || bookingRecord.customerFeatures?.dropoffCoordinates || null,
                dropoffGoogleMapsUrl: sanitizeInput(bookingRecord.dropoffGoogleMapsUrl || bookingRecord.locationPins?.dropoff?.googleMapsUrl || '', 240),
                locationPins: bookingRecord.locationPins || bookingRecord.customerFeatures?.locationPins || {},
                routeStopLocations: Array.isArray(bookingRecord.routeStopLocations) ? bookingRecord.routeStopLocations : (bookingRecord.locationPins?.stops || []),
                amount: Number(bookingRecord.amount || bookingRecord.totalFare || bookingRecord.fare || 0),
                totalFare: Number(bookingRecord.totalFare || bookingRecord.amount || bookingRecord.fare || 0),
                sourceKey: 'customer_booking_submit',
                mode: sanitizeInput(bookingRecord.mode || reason || 'customer_booking_submit', 80),
                backendStatus: sanitizeInput(reason || bookingRecord.backendStatus || 'customer_booking_submit', 120),
                adminReviewStatus: sanitizeInput(bookingRecord.adminReviewStatus || 'pending', 40) || 'pending',
                status: sanitizeInput(bookingRecord.status || 'pending_admin_review', 40) || 'pending_admin_review'
            };
        }

        async function queueBookingRecordForBackendAdminReview(bookingRecord, reason = 'customer_booking_submit') {
            const payloadBooking = buildAdminReviewQueuePayload(bookingRecord, reason);
            if (!payloadBooking) {
                return { ok: false, reason: 'missing_booking_record' };
            }

            const bookingId = payloadBooking.bookingId;
            updateBookingDeliveryState(bookingId, {
                adminQueueSyncStatus: 'sending',
                adminQueueSyncReason: sanitizeInput(reason || 'customer_booking_submit', 120),
                adminQueueSyncUpdatedAt: new Date().toISOString()
            });

            const result = await fetchJsonAcrossApiBases('/api/bookings/fallback/admin-review-queue', {
                method: 'POST',
                token: '',
                includeJson: true,
                includeIdempotency: true,
                idPrefix: 'gir-booking-admin-review-queue',
                idempotencyKey: createAdminReviewQueueIdempotencyKey(bookingId),
                extraHeaders: {
                    'x-booking-client': 'goindiaride-web'
                },
                body: {
                    source: 'customer_booking_submit',
                    reason: sanitizeInput(reason || 'customer_booking_submit', 120),
                    bookings: [payloadBooking]
                },
                timeoutMs: 12000
            });

            const data = result.data || {};
            const queuedItem = Array.isArray(data.items)
                ? data.items.find((item) => sanitizeInput(item.bookingId || item.id || '', 120) === bookingId)
                : null;

            if (result.ok && data.ok !== false) {
                const queueState = sanitizeInput(queuedItem?.state || (data.queued ? 'queued' : data.existing ? 'existing' : 'queued'), 80);
                updateBookingDeliveryState(bookingId, {
                    adminQueueSyncStatus: queueState,
                    adminQueueSyncedAt: new Date().toISOString(),
                    backendStatus: `admin_review_queue_${queueState}`
                });
                broadcastAdminReviewQueueSync(bookingId, {
                    apiBase: result.apiBase,
                    state: queueState,
                    reason
                });
                return { ok: true, bookingId, apiBase: result.apiBase, data };
            }

            const reasonText = sanitizeInput(result.reason || data.message || 'admin_review_queue_failed', 160);
            updateBookingDeliveryState(bookingId, {
                adminQueueSyncStatus: 'pending',
                adminQueueSyncReason: reasonText,
                adminQueueSyncUpdatedAt: new Date().toISOString()
            });
            return { ok: false, bookingId, reason: reasonText, attempts: result.attempts || [] };
        }

        async function sendAdminEmailForQueuedBooking(bookingRecord, reason = 'local_fallback') {
            if (!bookingRecord || typeof bookingRecord !== 'object') {
                return { ok: false, reason: 'missing_booking_record' };
            }

            const bookingId = sanitizeInput(bookingRecord.id || bookingRecord.bookingId || '');
            if (!bookingId) {
                return { ok: false, reason: 'missing_booking_id' };
            }

            const token = String(getBackendAccessToken() || '').trim();
            const apiBases = getBackendApiBaseCandidates();
            if (!apiBases.length) {
                return {
                    ok: false,
                    reason: 'no_available_api_base_candidates',
                    status: 0,
                    attempts: []
                };
            }
            const customerPhoneMeta = resolveCurrentCustomerPhoneMeta();
            const resolvedCustomerPhone = sanitizeInput(
                bookingRecord.customerPhone || customerPhoneMeta.displayPhone || customerPhoneMeta.localPhone || '',
                40
            );
            const payload = {
                bookingId,
                customerId: sanitizeInput(bookingRecord.customerId || ''),
                customerName: sanitizeInput(bookingRecord.customerName || ''),
                customerEmail: sanitizeInput(bookingRecord.customerEmail || (currentUser && currentUser.email) || ''),
                customerPhone: resolvedCustomerPhone,
                pickup: sanitizeInput(bookingRecord.pickup || ''),
                drop: sanitizeInput(bookingRecord.dropoff || bookingRecord.drop || ''),
                pickupCoordinates: bookingRecord.pickupCoordinates || bookingRecord.locationPins?.pickup?.coordinates || bookingRecord.customerFeatures?.pickupCoordinates || null,
                dropoffCoordinates: bookingRecord.dropoffCoordinates || bookingRecord.locationPins?.dropoff?.coordinates || bookingRecord.customerFeatures?.dropoffCoordinates || null,
                pickupGoogleMapsUrl: sanitizeInput(bookingRecord.pickupGoogleMapsUrl || bookingRecord.locationPins?.pickup?.googleMapsUrl || '', 240),
                dropoffGoogleMapsUrl: sanitizeInput(bookingRecord.dropoffGoogleMapsUrl || bookingRecord.locationPins?.dropoff?.googleMapsUrl || '', 240),
                locationPins: bookingRecord.locationPins || bookingRecord.customerFeatures?.locationPins || {},
                rideDate: sanitizeInput(bookingRecord.rideDate || ''),
                rideTime: sanitizeInput(bookingRecord.rideTime || ''),
                returnDate: sanitizeInput(bookingRecord.returnTrip?.returnDate || ''),
                returnTime: sanitizeInput(bookingRecord.returnTrip?.returnTime || ''),
                tripPlan: sanitizeInput(bookingRecord.tripPlan || ''),
                tripServiceType: sanitizeInput(bookingRecord.tripServiceType || bookingRecord.serviceType || ''),
                airportTerminalNote: sanitizeInput(bookingRecord.airportTerminalNote || ''),
                travelAssurance: bookingRecord.travelAssurance || bookingRecord.customerFeatures?.travelAssurance || {},
                flightDetails: bookingRecord.flightDetails || bookingRecord.customerFeatures?.flightDetails || {},
                policyPreferences: bookingRecord.policyPreferences || bookingRecord.customerFeatures?.policyPreferences || {},
                billingDetails: bookingRecord.billingDetails || bookingRecord.customerFeatures?.billingDetails || {},
                bookingAddOns: bookingRecord.bookingAddOns || bookingRecord.customerFeatures?.addOns || {},
                paymentMethod: sanitizeInput(bookingRecord.paymentMethod || ''),
                vehicleType: sanitizeInput(bookingRecord.vehicleType || bookingRecord.rideType || ''),
                vehicleModel: sanitizeInput(bookingRecord.vehicleModel || ''),
                vehicleFuelPreference: sanitizeInput(bookingRecord.vehicleFuelPreference || bookingRecord.fuelPreference || ''),
                passengers: Number(bookingRecord.passengers || 1),
                luggage: sanitizeInput(bookingRecord.luggage || ''),
                notes: sanitizeInput(bookingRecord.notes || ''),
                stops: Array.isArray(bookingRecord.stops) ? bookingRecord.stops : [],
                routeStopLocations: Array.isArray(bookingRecord.routeStopLocations) ? bookingRecord.routeStopLocations : (bookingRecord.locationPins?.stops || []),
                specialRequests: bookingRecord.customerFeatures?.specialRequests || {},
                safetyAccessibility: bookingRecord.customerFeatures?.safetyAccessibility || {},
                distanceKm: Number(bookingRecord.distanceKm || bookingRecord.distance || 0),
                distanceSource: sanitizeInput(bookingRecord.distanceSource || ''),
                budgetAmount: Number(bookingRecord.budgetAmount || 0),
                customerBidAmount: Number(bookingRecord.customerBidAmount || 0),
                amount: Number(bookingRecord.totalFare || bookingRecord.amount || 0),
                fareBreakdown: bookingRecord.fareBreakdown || {},
                fareQuote: bookingRecord.fareQuote || {},
                fareHash: sanitizeInput(bookingRecord.fareHash || ''),
                promoCode: sanitizeInput(bookingRecord.promo?.code || bookingRecord.referralCode || ''),
                currency: 'INR',
                fallbackReason: sanitizeInput(reason || 'local_fallback')
            };

            localStorage.setItem(LAST_ADMIN_EMAIL_DISPATCH_KEY, JSON.stringify({
                bookingId,
                state: 'started',
                reason: sanitizeInput(reason || 'local_fallback', 120),
                updatedAt: new Date().toISOString()
            }));
            updateBookingDeliveryState(bookingId, {
                adminEmailDispatch: {
                    state: 'sending',
                    reason: sanitizeInput(reason || 'local_fallback', 120),
                    updatedAt: new Date().toISOString()
                }
            });

            const attempts = [];
            const fallbackIdempotencyKey = createStableFallbackEmailIdempotencyKey(bookingId);
            for (const apiBase of apiBases) {
                if (isApiBaseQuarantined(apiBase)) {
                    attempts.push({
                        apiBase,
                        status: 0,
                        reason: 'api_base_quarantined'
                    });
                    continue;
                }
                try {
                    const response = await fetchWithTimeout(`${apiBase}/api/bookings/fallback/admin-alert-email`, {
                        method: 'POST',
                        keepalive: true,
                        cache: 'no-store',
                        headers: {
                            ...buildSecureApiHeaders({
                                token,
                                includeJson: true,
                                includeIdempotency: true,
                                idPrefix: 'gir-booking-fallback-email',
                                idempotencyKey: fallbackIdempotencyKey
                            }),
                            'x-booking-client': 'goindiaride-web'
                        },
                        body: JSON.stringify(payload)
                    }, 65000);

                    const data = await parseJsonSafe(response);
                    if (isDuplicateIdempotencyConflictResponse(response.status, data)) {
                        clearApiBaseQuarantine(apiBase);
                        return {
                            ok: true,
                            bookingId: sanitizeInput(data.bookingId || bookingId),
                            adminEmail: {
                                sent: true,
                                skipped: false,
                                deduped: true,
                                reason: 'duplicate_suppressed'
                            },
                            customerEmail: data.customerEmail || {
                                sent: false,
                                skipped: true,
                                reason: 'duplicate_suppressed'
                            },
                            apiBase,
                            deduped: true
                        };
                    }
                    if (response.ok && data.ok !== false) {
                        clearApiBaseQuarantine(apiBase);
                        localStorage.setItem(LAST_ADMIN_EMAIL_DISPATCH_KEY, JSON.stringify({
                            bookingId: sanitizeInput(data.bookingId || bookingId, 120),
                            state: 'success',
                            apiBase,
                            adminEmail: data.adminEmail || null,
                            customerEmail: data.customerEmail || null,
                            updatedAt: new Date().toISOString()
                        }));
                        updateBookingDeliveryState(sanitizeInput(data.bookingId || bookingId, 120), {
                            adminEmailDispatch: resolveEmailDispatchState(data.adminEmail, 'sent', ''),
                            customerEmailDispatch: resolveEmailDispatchState(data.customerEmail, 'pending', ''),
                            lastEmailDispatchAt: new Date().toISOString()
                        });
                        return {
                            ok: true,
                            bookingId: sanitizeInput(data.bookingId || bookingId),
                            adminEmail: data.adminEmail || null,
                            customerEmail: data.customerEmail || null,
                            apiBase
                        };
                    }

                    const responseReason = sanitizeInput(data.reason || data.message || `http_${response.status}`, 140);
                    const statusCode = Number(response.status || 0);
                    if (shouldQuarantineApiBase(apiBase, statusCode, responseReason)) {
                        const ttlMs = statusCode === 404 || statusCode === 405
                            ? API_BASE_QUARANTINE_STATIC_MS
                            : API_BASE_QUARANTINE_DEFAULT_MS;
                        quarantineApiBase(apiBase, responseReason, statusCode, ttlMs);
                    }
                    attempts.push({
                        apiBase,
                        status: statusCode,
                        reason: responseReason
                    });

                    // Retry on known unavailable backends, keep trying next candidate.
                    if ([404, 405, 408, 429, 500, 502, 503, 504].includes(statusCode)) {
                        continue;
                    }

                    return {
                        ok: false,
                        reason: responseReason || `http_${response.status}`,
                        status: statusCode,
                        apiBase,
                        customerEmail: data.customerEmail || null,
                        attempts
                    };
                } catch (error) {
                    const reasonText = sanitizeInput(classifyBrowserRequestFailure(apiBase, error), 140);
                    if (shouldQuarantineApiBase(apiBase, 0, reasonText)) {
                        quarantineApiBase(apiBase, reasonText, 0, API_BASE_QUARANTINE_DNS_MS);
                    }
                    attempts.push({
                        apiBase,
                        status: 0,
                        reason: reasonText
                    });
                }
            }

            const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
            localStorage.setItem(LAST_ADMIN_EMAIL_DISPATCH_KEY, JSON.stringify({
                bookingId,
                state: 'failed',
                reason: lastAttempt ? sanitizeInput(lastAttempt.reason || 'request_failed', 140) : 'fallback_email_request_failed',
                apiBase: lastAttempt ? sanitizeInput(lastAttempt.apiBase || '', 240) : '',
                updatedAt: new Date().toISOString()
            }));
            updateBookingDeliveryState(bookingId, {
                adminEmailDispatch: {
                    state: 'pending',
                    reason: lastAttempt ? sanitizeInput(lastAttempt.reason || 'request_failed', 140) : 'fallback_email_request_failed',
                    updatedAt: new Date().toISOString()
                },
                lastEmailDispatchAt: new Date().toISOString()
            });
            return {
                ok: false,
                reason: lastAttempt ? `${lastAttempt.reason || 'request_failed'} [${lastAttempt.apiBase}]` : 'fallback_email_request_failed',
                status: lastAttempt ? Number(lastAttempt.status || 0) : 0,
                attempts
            };
        }

        function handleBookingFormSubmit(e) {
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            if (e && typeof e.stopPropagation === 'function') {
                e.stopPropagation();
            }

            if (bookingSubmitInProgress) {
                return false;
            }

            bookingSubmitInProgress = true;
            Promise.resolve(bookRide(e))
                .catch((error) => {
                    console.error('Booking submit wrapper failed', error);
                    showError('Booking submit failed. Please try again.');
                })
                .finally(() => {
                    bookingSubmitInProgress = false;
                });

            return false;
        }

        async function bookRide(e) {
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            if (e && typeof e.stopPropagation === 'function') {
                e.stopPropagation();
            }

            // Sanitize all inputs
            const pickup = sanitizeInput(document.getElementById('pickup').value);
            let dropoff = sanitizeInput(document.getElementById('dropoff').value);
            const rideDate = document.getElementById('rideDate').value;
            const rideTime = document.getElementById('rideTime').value;
            const rideType = document.querySelector('input[name="rideType"]:checked').value;
            const vehicleFuelPreference = document.getElementById('vehicleFuelPreference')?.value || 'no_preference';
            const tripPlan = document.getElementById('tripPlan').value;
            const activeFlow = getActiveCabFlow();
            const paymentMethod = document.getElementById('paymentMethod').value;
            const passengers = parseInt(document.getElementById('passengers').value, 10) || 1;
            const luggage = document.getElementById('luggage').value;
            const promoCodeInput = sanitizeInput(document.getElementById('promoCode').value).trim().toUpperCase();
            const isReturnTrip = document.getElementById('isReturnTrip').checked;
            const returnDate = document.getElementById('returnDate').value;
            const returnTime = document.getElementById('returnTime').value;
            const notes = sanitizeInput(document.getElementById('notes').value);
            const airportTerminalNote = activeFlow === 'airport'
                ? sanitizeInput(document.getElementById('cabQuickTerminalInput')?.value || '').trim()
                : '';
            const intermediateStops = readRouteStops();
            const travelAssurance = readTravelAssuranceDetails();
            if (activeFlow === 'day_trips' && pickup && !dropoff) {
                dropoff = `Day plan within ${pickup}`;
                const dropoffNode = document.getElementById('dropoff');
                if (dropoffNode) dropoffNode.value = dropoff;
            }
            const locationPins = buildBookingLocationSnapshot();

            const specialRequests = {
                airCondition: document.getElementById('airCondition').checked,
                wifi: document.getElementById('wifi').checked,
                charger: document.getElementById('charger').checked,
                music: document.getElementById('music').checked
            };

            const safetyAccessibility = {
                womenDriverPref: document.getElementById('womenDriverPref').checked,
                childSeat: document.getElementById('childSeat').checked,
                wheelchairAssist: document.getElementById('wheelchairAssist').checked,
                petFriendly: document.getElementById('petFriendly').checked,
                liveTripShare: document.getElementById('liveTripShare').checked,
                maskedCall: document.getElementById('maskedCall').checked
            };

            if (!pickup || !dropoff) {
                showError('Please enter both pickup and dropoff locations');
                revealBookingField(!pickup ? 'pickup' : 'dropoff');
                return;
            }

            if (pickup === dropoff && activeFlow !== 'day_trips') {
                showError('Pickup and dropoff cannot be same');
                revealBookingField('dropoff');
                return;
            }

            if (activeFlow === 'airport' && isAirportTerminalDetailRequired() && !airportTerminalNote) {
                showError('Please enter airport terminal, gate, pillar or pickup/drop point');
                const terminalField = document.getElementById('cabQuickTerminalInput');
                if (terminalField) {
                    terminalField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    window.setTimeout(() => terminalField.focus({ preventScroll: true }), 40);
                }
                return;
            }

            if (
                travelAssurance.billingDetails.gstInvoiceRequired
                && (!travelAssurance.billingDetails.gstCompanyName || !travelAssurance.billingDetails.gstNumber)
            ) {
                showError('GST invoice ke liye company name aur GST number enter karein');
                revealBookingField(!travelAssurance.billingDetails.gstCompanyName ? 'gstCompanyName' : 'gstNumber');
                return;
            }

            const now = new Date();
            const outboundDateTime = buildLocalDateTime(rideDate, rideTime);
            if (!outboundDateTime) {
                showError('Please select valid ride date and time');
                revealBookingField(!rideDate ? 'rideDate' : 'rideTime');
                return;
            }

            if (outboundDateTime.getTime() < now.getTime() - 60 * 1000) {
                showError('Please select a future time for booking');
                revealBookingField('rideTime');
                return;
            }

            let returnDateTime = null;
            if (isReturnTrip) {
                returnDateTime = buildLocalDateTime(returnDate, returnTime);
                if (!returnDateTime) {
                    showError('Please select valid return date and time');
                    revealBookingField(!returnDate ? 'returnDate' : 'returnTime');
                    return;
                }

                if (returnDateTime.getTime() <= outboundDateTime.getTime()) {
                    showError('Return trip time must be after the onward trip');
                    revealBookingField('returnTime');
                    return;
                }
            }

            updateFare();
            const bookingId = 'RID' + Date.now();
            const fareCalculator = getFareCalculator();
            const fareEstimateInputs = readFareEstimateInputs();
            const currentFareEstimate = latestFareEstimate && typeof latestFareEstimate === 'object'
                ? latestFareEstimate
                : (fareCalculator ? fareCalculator.estimateBookingFare(fareEstimateInputs) : buildFallbackFareEstimate(fareEstimateInputs));
            const totalFare = Number(currentFareEstimate.totalFare || currentFareEstimate.amount || parseCurrencyValue(document.getElementById('totalFare').textContent) || 0);
            const distance = Math.max(0, Math.round(Number(currentFareEstimate.distanceKm || parseInt(document.getElementById('distanceKm').textContent, 10) || 0)));
            const distanceSource = sanitizeInput(currentFareEstimate.distanceSource || document.getElementById('distanceSource').textContent || '');
            if (BOOKING_STRICT_LIVE_MODE && (!distance || !isLiveDistanceResolved(distanceSource))) {
                showError('Live route distance unavailable. Please choose valid pickup/drop from suggestions and try again.');
                revealBookingField('dropoff');
                return;
            }
            const bookingPhoneInput = document.getElementById('bookingCustomerPhone');
            const customerPhoneMeta = resolveCurrentCustomerPhoneMeta();
            if (!customerPhoneMeta.localPhone) {
                showError('Booking ke liye customer mobile number compulsory hai. Please enter your mobile number.');
                revealBookingField('bookingCustomerPhone');
                return;
            }
            if (BOOKING_PHONE_OTP_REQUIRED && customerPhoneMeta.hasVerificationMarker && !customerPhoneMeta.verified) {
                showError('Booking ke liye verified mobile number compulsory hai. Please complete OTP verification first.');
                revealBookingField('bookingCustomerPhone');
                setBookingPhoneStatus('Please verify this mobile number with OTP before booking.', 'error');
                return;
            }
            const resolvedBookingPhone = customerPhoneMeta.displayPhone || customerPhoneMeta.localPhone;
            if (bookingPhoneInput) {
                bookingPhoneInput.value = resolvedBookingPhone;
            }
            setBookingPhoneStatus(
                BOOKING_PHONE_OTP_REQUIRED
                    ? `Verified mobile ready: ${resolvedBookingPhone}`
                    : `Contact number ready: ${resolvedBookingPhone}`,
                'success'
            );

            const fareBreakdown = {
                ...currentFareEstimate,
                baseFare: Number(currentFareEstimate.baseFare || parseCurrencyValue(document.getElementById('baseFare').textContent) || 0),
                distanceFare: Number(currentFareEstimate.distanceFare || parseCurrencyValue(document.getElementById('distanceFare').textContent) || 0),
                timeFare: Number(currentFareEstimate.timeFare || parseCurrencyValue(document.getElementById('timeFare').textContent) || 0),
                passengerFare: Number(currentFareEstimate.passengerFare || parseCurrencyValue(document.getElementById('passengerFare').textContent) || 0),
                tripPlanFare: Number(currentFareEstimate.tripPlanFare || parseCurrencyValue(document.getElementById('tripPlanFare').textContent) || 0),
                luggageFare: Number(currentFareEstimate.luggageFare || parseCurrencyValue(document.getElementById('luggageFare').textContent) || 0),
                extrasFare: Number(currentFareEstimate.extrasFare || parseCurrencyValue(document.getElementById('extrasFare').textContent) || 0),
                safetyFare: Number(currentFareEstimate.safetyFare || parseCurrencyValue(document.getElementById('safetyFare').textContent) || 0),
                stopFare: Number(currentFareEstimate.stopFare || parseCurrencyValue(document.getElementById('stopFare').textContent) || 0),
                returnTripFare: Number(currentFareEstimate.returnTripFare || parseCurrencyValue(document.getElementById('returnTripFare').textContent) || 0),
                tollCharge: Number(currentFareEstimate.tollCharge || parseCurrencyValue(document.getElementById('tollFare').textContent) || 0),
                parkingCharge: Number(currentFareEstimate.parkingCharge || parseCurrencyValue(document.getElementById('parkingFare').textContent) || 0),
                stateTax: Number(currentFareEstimate.stateTax || parseCurrencyValue(document.getElementById('stateTaxFare').textContent) || 0),
                nightCharge: Number(currentFareEstimate.nightCharge || parseCurrencyValue(document.getElementById('nightFare').textContent) || 0),
                paymentFee: Number(currentFareEstimate.paymentFee || parseCurrencyValue(document.getElementById('paymentFee').textContent) || 0),
                taxesFare: Number(currentFareEstimate.taxesFare || parseCurrencyValue(document.getElementById('taxesFare').textContent) || 0),
                promoDiscount: Math.abs(Number(currentFareEstimate.promoDiscount || parseCurrencyValue(document.getElementById('promoDiscount').textContent) || 0)),
                customerBidAmount: Number(currentFareEstimate.customerBidAmount || fareEstimateInputs.budgetAmount || 0),
                budgetAmount: Number(currentFareEstimate.budgetAmount || fareEstimateInputs.budgetAmount || 0),
                totalFare: totalFare,
                amount: totalFare,
                finalFare: totalFare
            };

            const paymentMeta = {
                method: paymentMethod,
                status: 'pending',
                mode: ['international_card', 'paypal'].includes(paymentMethod) ? 'international' : 'india',
                currency: 'INR'
            };

            const activePromoCode = appliedPromo?.code || promoCodeInput || null;
            const customerFeatures = {
                specialRequests,
                safetyAccessibility,
                hasStops: intermediateStops.length > 0,
                hasReturnTrip: isReturnTrip,
                airportTerminalNote,
                vehicleFuelPreference,
                locationPins,
                pickupCoordinates: locationPins.pickup.coordinates,
                dropoffCoordinates: locationPins.dropoff.coordinates,
                routeStopLocations: locationPins.stops,
                travelAssurance,
                flightDetails: travelAssurance.flightDetails,
                policyPreferences: travelAssurance.policyPreferences,
                billingDetails: travelAssurance.billingDetails,
                addOns: travelAssurance.addOns
            };

            const booking = {
                id: bookingId,
                bookingId: bookingId,
                customerId: currentUser.id,
                customerName: sanitizeInput(currentUser.fullname || currentUser.name || 'Customer', 140),
                customerEmail: resolveCurrentCustomerEmail(),
                customerPhone: resolvedBookingPhone,
                phoneVerification: {
                    status: BOOKING_PHONE_OTP_REQUIRED ? 'verified' : 'contact_only',
                    source: BOOKING_PHONE_OTP_REQUIRED ? 'customer_otp' : 'customer_required_contact',
                    fallbackReason: ''
                },
                pickup: pickup,
                dropoff: dropoff,
                pickupCoordinates: locationPins.pickup.coordinates,
                dropoffCoordinates: locationPins.dropoff.coordinates,
                pickupGoogleMapsUrl: locationPins.pickup.googleMapsUrl,
                dropoffGoogleMapsUrl: locationPins.dropoff.googleMapsUrl,
                locationPins,
                stops: intermediateStops,
                routeStopLocations: locationPins.stops,
                rideType: rideType,
                vehicleType: rideType,
                vehicleModel: fareEstimateInputs.vehicleModel || '',
                vehicleFuelPreference: fareEstimateInputs.vehicleFuelPreference || vehicleFuelPreference,
                fuelPreference: fareEstimateInputs.vehicleFuelPreference || vehicleFuelPreference,
                passengers: passengers,
                luggage: luggage,
                rideDate: rideDate,
                rideTime: rideTime,
                tripPlan: tripPlan,
                tripServiceType: fareEstimateInputs.tripServiceType || '',
                airportServiceMode: fareEstimateInputs.airportServiceMode || '',
                airportServiceLabel: fareEstimateInputs.airportServiceLabel || '',
                airportTerminalNote: airportTerminalNote || fareEstimateInputs.airportTerminalNote || '',
                travelAssurance,
                flightDetails: travelAssurance.flightDetails,
                policyPreferences: travelAssurance.policyPreferences,
                billingDetails: travelAssurance.billingDetails,
                bookingAddOns: travelAssurance.addOns,
                paymentMethod: paymentMethod,
                budgetAmount: Number(fareEstimateInputs.budgetAmount || 0),
                customerBidAmount: Number(fareEstimateInputs.budgetAmount || 0),
                distance: distance,
                distanceKm: distance,
                distanceSource: distanceSource,
                totalFare: totalFare,
                amount: totalFare,
                status: 'pending',
                notes: notes,
                createdAt: new Date().toISOString(),
                outboundDateTime: outboundDateTime.toISOString(),
                returnTrip: isReturnTrip ? {
                    enabled: true,
                    returnDate: returnDate,
                    returnTime: returnTime,
                    returnDateTime: returnDateTime ? returnDateTime.toISOString() : null
                } : {
                    enabled: false,
                    returnDate: null,
                    returnTime: null,
                    returnDateTime: null
                },
                fareBreakdown: fareBreakdown,
                fareQuote: {
                    amount: totalFare,
                    distanceKm: distance,
                    source: distanceSource,
                    routeCategory: fareBreakdown.routeCategory || ''
                },
                fareHash: fareBreakdown.fareHash || '',
                payment: paymentMeta,
                promo: {
                    code: activePromoCode,
                    discount: fareBreakdown.promoDiscount
                },
                customerFeatures: customerFeatures,
                driverId: null,
                driverName: null,
                driverETA: null,
                statusHistory: [
                    {
                        status: 'pending',
                        at: new Date().toISOString(),
                        source: 'customer'
                    }
                ]
            };

            let token = '';
            const tokenResult = await resolveFreshBookingAccessToken('booking_submit');
            if (tokenResult.ok && tokenResult.token) {
                token = String(tokenResult.token || '').trim();
            }
            if (!token) {
                console.warn('Booking fallback activated: secure token missing or expired.', tokenResult.reason || 'missing_or_expired_access_token');
                await submitBookingThroughAdminReviewFallback(
                    booking,
                    'token_missing_local_queue',
                    {
                        mode: 'local_secure_fallback',
                        clearAccessToken: true,
                        toastMessage: `Booking ${bookingId} submitted for admin review. Live email dispatch is running (token_missing_local_queue).`
                    }
                );
                return;
            }

            try {
                const fareEstimatePayload = {
                    ...fareEstimateInputs,
                    distanceKm: distance,
                    distanceSource,
                    budgetAmount: Number(fareEstimateInputs.budgetAmount || 0),
                    customerBidAmount: Number(fareEstimateInputs.budgetAmount || 0),
                    fareBreakdown,
                    fareQuote: {
                        amount: totalFare,
                        distanceKm: distance,
                        source: distanceSource,
                        routeCategory: fareBreakdown.routeCategory || ''
                    }
                };

                const fareEstimateResult = await fetchJsonAcrossApiBases(
                    '/api/bookings/fare/estimate',
                    {
                        method: 'POST',
                        token,
                        includeJson: true,
                        includeIdempotency: true,
                        idPrefix: 'gir-booking-fare-estimate',
                        body: fareEstimatePayload,
                        timeoutMs: 8000
                    }
                );

                if (!fareEstimateResult.ok) {
                    const estimateReason = formatApiReason(fareEstimateResult.reason, 'secure_fare_estimate_failed');
                    throw new Error(`Secure fare estimate unavailable (${estimateReason})`);
                }

                const fareEstimateData = fareEstimateResult.data || {};
                const secureEstimate = fareEstimateData.estimate && typeof fareEstimateData.estimate === 'object'
                    ? fareEstimateData.estimate
                    : fareEstimateData;
                const secureDistanceKm = Number(secureEstimate.distanceKm || distance);
                const secureAmount = Number(secureEstimate.totalFare || secureEstimate.amount || 0);
                const secureFareHash = sanitizeInput(fareEstimateData.fareHash || secureEstimate.fareHash || '');

                if (!Number.isFinite(secureDistanceKm) || secureDistanceKm <= 0 || !Number.isFinite(secureAmount) || secureAmount <= 0 || !secureFareHash) {
                    throw new Error('Secure fare estimate invalid. Please try again.');
                }

                const createPayload = {
                    cardToken: `tok_${paymentMethod}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`,
                    distanceKm: secureDistanceKm,
                    amount: secureAmount,
                    fareHash: secureFareHash,
                    customerPhone: customerPhoneMeta.localPhone || '',
                    referralCode: activePromoCode || '',
                    promoCode: activePromoCode || '',
                    pickup,
                    drop: dropoff,
                    pickupCoordinates: locationPins.pickup.coordinates,
                    dropoffCoordinates: locationPins.dropoff.coordinates,
                    pickupGoogleMapsUrl: locationPins.pickup.googleMapsUrl,
                    dropoffGoogleMapsUrl: locationPins.dropoff.googleMapsUrl,
                    locationPins,
                    vehicleType: rideType,
                    vehicleModel: fareEstimateInputs.vehicleModel || '',
                    vehicleFuelPreference: fareEstimateInputs.vehicleFuelPreference || vehicleFuelPreference,
                    fuelPreference: fareEstimateInputs.vehicleFuelPreference || vehicleFuelPreference,
                    paymentMethod,
                    tripPlan,
                    tripServiceType: fareEstimateInputs.tripServiceType || '',
                    passengers,
                    budgetAmount: Number(fareEstimateInputs.budgetAmount || 0),
                    customerBidAmount: Number(fareEstimateInputs.budgetAmount || 0),
                    rideDate,
                    rideTime,
                    returnDate: isReturnTrip ? returnDate : '',
                    returnTime: isReturnTrip ? returnTime : '',
                    luggage,
                    stops: intermediateStops,
                    routeStopLocations: locationPins.stops,
                    travelAssurance,
                    flightDetails: travelAssurance.flightDetails,
                    policyPreferences: travelAssurance.policyPreferences,
                    billingDetails: travelAssurance.billingDetails,
                    bookingAddOns: travelAssurance.addOns,
                    specialRequests,
                    safetyAccessibility,
                    customerFeatures,
                    notes,
                    distanceSource,
                    fareBreakdown: secureEstimate,
                    fareQuote: {
                        amount: secureAmount,
                        distanceKm: secureDistanceKm,
                        source: secureEstimate.distanceSource || distanceSource,
                        routeCategory: secureEstimate.routeCategory || fareBreakdown.routeCategory || ''
                    }
                };

                let createResult = await fetchJsonAcrossApiBases('/api/bookings', {
                    method: 'POST',
                    token,
                    includeJson: true,
                    includeIdempotency: true,
                    idPrefix: 'gir-booking-create',
                    extraHeaders: {
                        'x-booking-client': 'goindiaride-web'
                    },
                    body: createPayload,
                    timeoutMs: 9000
                });

                if (!createResult.ok && isBookingAuthFailureReason(createResult.reason, createResult.status)) {
                    clearBackendAccessTokens();
                    const refreshedCreateToken = await refreshBookingBackendAccessToken('booking_create_auth_retry');
                    if (refreshedCreateToken.ok && refreshedCreateToken.token) {
                        token = String(refreshedCreateToken.token || '').trim();
                        createResult = await fetchJsonAcrossApiBases('/api/bookings', {
                            method: 'POST',
                            token,
                            includeJson: true,
                            includeIdempotency: true,
                            idPrefix: 'gir-booking-create-retry',
                            extraHeaders: {
                                'x-booking-client': 'goindiaride-web'
                            },
                            body: createPayload,
                            timeoutMs: 9000
                        });
                    }
                }

                if (!createResult.ok) {
                    const createReason = formatApiReason(createResult.reason, 'live_booking_create_failed');
                    if (isBookingAuthFailureReason(createReason, createResult.status)) {
                        console.warn('Live booking auth expired; sent to admin review fallback.', createReason);
                        await submitBookingThroughAdminReviewFallback(
                            booking,
                            `auth_expired_admin_queue:${createReason}`,
                            {
                                mode: 'local_secure_fallback',
                                clearAccessToken: true,
                                toastMessage: `Booking ${bookingId} submitted for admin review. Login session expired, so admin approval queue was used.`
                            }
                        );
                        return;
                    }
                    throw new Error(`Live booking create failed (${createReason})`);
                }

                const createData = createResult.data || {};
                const liveBookingId = sanitizeInput(createData.bookingId || bookingId);
                const liveBooking = {
                    ...booking,
                    id: liveBookingId,
                    bookingId: liveBookingId,
                    status: 'pending_admin_review',
                    backendStatus: sanitizeInput(createData.status || 'created'),
                    adminReviewStatus: sanitizeInput(createData.adminReviewStatus || 'pending'),
                    mode: 'live_backend',
                    createdAt: new Date().toISOString()
                };

                queueBookingForAdminReview(
                    liveBooking,
                    'live_backend',
                    sanitizeInput(createData.status || 'created'),
                    `Booking ${liveBookingId} created and sent to admin for live approval`
                );
                const liveQueueResult = await queueBookingRecordForBackendAdminReview(liveBooking, 'live_backend_created');
                if (!liveQueueResult.ok) {
                    console.warn('Live booking admin queue mirror pending:', liveQueueResult.reason || 'queue_failed');
                }
                handleBookingEmailDispatchFeedback({
                    ok: true,
                    bookingId: liveBookingId,
                    adminEmail: createData.adminEmail || null,
                    customerEmail: createData.customerEmail || null
                });
                console.log('✅ Live booking created:', liveBookingId, createData);
            } catch (error) {
                console.error('Live booking failed', error);
                const fallbackMessage = sanitizeInput(error.message || 'live_booking_failed');
                if (isBookingAuthFailureReason(fallbackMessage)) {
                    console.warn('Booking auth failed after submit; using admin review fallback.', fallbackMessage);
                    await submitBookingThroughAdminReviewFallback(
                        booking,
                        `auth_expired_admin_queue:${fallbackMessage}`,
                        {
                            mode: 'local_secure_fallback',
                            clearAccessToken: true,
                            toastMessage: `Booking ${bookingId} submitted for admin review. Login session expired, so admin approval queue was used.`
                        }
                    );
                    return;
                }
                if (BOOKING_STRICT_LIVE_MODE) {
                    showError(error?.message || 'Live booking server unavailable right now. Please retry in a moment.');
                    return;
                }
                await submitBookingThroughAdminReviewFallback(
                    booking,
                    `live_error:${fallbackMessage}`,
                    {
                        mode: 'local_secure_fallback',
                        toastMessage: `Live server unavailable, but booking ${bookingId} saved and sent to admin queue.`
                    }
                );
            }
        }

        function assignDriver(bookingId) {
            // Driver auto-assignment is intentionally paused for now.
            // Keep this block for future activation without deleting logic.
            if (!DRIVER_AUTO_ASSIGN_ENABLED) {
                console.info('Driver auto-assignment is disabled. Booking is waiting for admin review.', bookingId);
                return;
            }

            // Show "Finding driver" animation
            document.getElementById('matchingCard').style.display = 'block';
            document.getElementById('driverDetails').classList.remove('show');
            
            // Try to use database.js auto-assign if available
            if (typeof autoAssignDriver === 'function') {
                const driver = autoAssignDriver(bookingId);
                if (driver) {
                    setTimeout(() => {
                        updateDriverDisplay(driver, bookingId);
                        if (typeof showSuccessToast === 'function') {
                            showSuccessToast(`${driver.name} will be your driver. ETA: 5 minutes`, 'Driver Assigned');
                        }
                    }, 2000);
                    return;
                }
            }
            
            // Fallback to local drivers
            const drivers = JSON.parse(localStorage.getItem('goride_drivers')) || 
                           JSON.parse(localStorage.getItem('drivers')) || [];
            
            if (drivers.length === 0) {
                setTimeout(() => {
                    document.getElementById('matchingCard').style.display = 'none';
                    if (typeof showWarningToast === 'function') {
                        showWarningToast('No drivers available at the moment. Please try again in a few minutes.', 'No Drivers Available');
                    } else {
                        showError('No drivers available');
                    }
                }, 2000);
                return;
            }

            const randomDriver = drivers[Math.floor(Math.random() * drivers.length)];

            setTimeout(() => {
                let bookings = JSON.parse(localStorage.getItem('bookings')) || [];
                const bookingIdx = bookings.findIndex(b => b.id === bookingId);
                
                if (bookingIdx !== -1) {
                    bookings[bookingIdx].driverId = randomDriver.id;
                    bookings[bookingIdx].driverName = randomDriver.name;
                    bookings[bookingIdx].driverRating = randomDriver.rating || 5.0;
                    bookings[bookingIdx].driverPhone = randomDriver.phone;
                    bookings[bookingIdx].vehicleType = randomDriver.vehicle?.type || randomDriver.vehicleType;
                    bookings[bookingIdx].vehicleNumber = randomDriver.vehicle?.number || randomDriver.vehicleNumber;
                    bookings[bookingIdx].driverETA = (Math.floor(Math.random() * 5) + 2) + ' mins';
                    bookings[bookingIdx].status = 'confirmed';
                    bookings[bookingIdx].statusHistory = bookings[bookingIdx].statusHistory || [];
                    bookings[bookingIdx].statusHistory.push({
                        status: 'confirmed',
                        at: new Date().toISOString(),
                        source: 'driver',
                        driverId: randomDriver.id
                    });
                    
                    persistBookingStore(bookings);

                    const assignedBooking = bookings[bookingIdx];
                    broadcastPortalNotification({
                        type: 'driver_assigned',
                        title: 'Driver Assigned',
                        message: `Driver ${randomDriver.name} assigned to booking ${assignedBooking.id}`,
                        booking: assignedBooking,
                        sourcePortal: 'driver',
                        metadata: {
                            stage: 'driver_assigned',
                            bookingId: assignedBooking.id,
                            driverId: randomDriver.id
                        }
                    });

                    updateDriverDisplay(randomDriver, bookingId);
                    
                    if (typeof showSuccessToast === 'function') {
                        showSuccessToast(`${randomDriver.name} will be your driver. ETA: ${bookings[bookingIdx].driverETA}`, 'Driver Assigned');
                    }
                }
            }, 2000);
        }
        
        function updateDriverDisplay(driver, bookingId) {
            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const booking = bookings.find(b => b.id === bookingId);
            
            document.getElementById('driverName').textContent = driver.name;
            document.getElementById('driverRating').textContent = `⭐⭐⭐⭐⭐ ${driver.rating || 5.0}`;
            document.getElementById('vehicleType').textContent = driver.vehicle?.model || driver.vehicleType || 'Car';
            document.getElementById('vehicleNumber').textContent = driver.vehicle?.number || driver.vehicleNumber || 'Pending';
            document.getElementById('driverETA').textContent = booking?.driverETA || 'Pending';

            const initials = driver.name.split(' ').map(n => n[0]).join('').toUpperCase();
            document.getElementById('driverAvatar').textContent = initials;
            document.getElementById('driverDetails').classList.add('show');
        }

        // 🎯 Complete ride and show donation
        function completeRideAndShowDonation(bookingId) {
            let bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const idx = bookings.findIndex(b => b.id === bookingId);
            
            if (idx !== -1) {
                bookings[idx].status = 'completed';
                bookings[idx].duration = Math.floor(Math.random() * 30) + 10 + ' mins';
                bookings[idx].statusHistory = bookings[idx].statusHistory || [];
                bookings[idx].statusHistory.push({
                    status: 'completed',
                    at: new Date().toISOString(),
                    source: 'driver'
                });
                persistBookingStore(bookings);

                const completedBooking = bookings[idx];
                broadcastPortalNotification({
                    type: 'ride_completed',
                    title: 'Ride Completed',
                    message: `Ride ${completedBooking.id} completed successfully`,
                    booking: completedBooking,
                    sourcePortal: 'driver',
                    metadata: {
                        stage: 'ride_completed',
                        bookingId: completedBooking.id
                    }
                });

                setTimeout(() => {
                    document.getElementById('successModal').classList.remove('active');
                    currentRideForDonation = bookingId;
                    selectedDonationAmount = 50;
                    document.getElementById('donationModal').classList.add('active');
                }, 1000);
            }
        }

        // ============================================
        // DONATION SYSTEM
        // ============================================

        function closeDonationModal() {
            document.getElementById('donationModal').classList.remove('active');
            window.location.href = './customer-dashboard.html';
        }

        function selectDonation(amount) {
            selectedDonationAmount = amount;
            document.querySelectorAll('.donation-btn-option').forEach(btn => {
                btn.classList.remove('selected');
            });
            event.target.classList.add('selected');
            document.getElementById('customDonationAmount').value = '';
        }

        document.getElementById('customDonationAmount')?.addEventListener('input', function() {
            if (this.value) {
                selectedDonationAmount = parseInt(this.value);
                document.querySelectorAll('.donation-btn-option').forEach(btn => {
                    btn.classList.remove('selected');
                });
            }
        });

        function submitDonation() {
            const customAmount = document.getElementById('customDonationAmount').value;
            const amount = customAmount ? parseInt(customAmount) : selectedDonationAmount;

            if (!amount || amount < 1) {
                alert('Please select a valid amount');
                return;
            }

            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const ride = bookings.find(b => b.id === currentRideForDonation);

            if (!ride) {
                alert('Ride not found');
                return;
            }

            // Create donation
            const donation = {
                id: 'DON' + Date.now(),
                rideId: currentRideForDonation,
                amount: amount,
                beneficiary: 'Underprivileged Driver Fund',
                createdAt: new Date().toISOString()
            };

            let donations = JSON.parse(localStorage.getItem('customerDonations_' + currentUser.id)) || [];
            donations.push(donation);
            localStorage.setItem('customerDonations_' + currentUser.id, JSON.stringify(donations));

            // Deduct from wallet
            let wallet = JSON.parse(localStorage.getItem(`wallet_${currentUser.id}`)) || { balance: 0, transactions: [] };
            wallet.balance -= amount;
            wallet.transactions = wallet.transactions || [];
            wallet.transactions.unshift({
                type: 'donation',
                amount: amount,
                description: 'Donation to help drivers',
                date: new Date().toISOString()
            });
            localStorage.setItem(`wallet_${currentUser.id}`, JSON.stringify(wallet));

            // Show receipt
            const totalAmount = ride.totalFare + amount;

            document.getElementById('receiptPickup').textContent = ride.pickup;
            document.getElementById('receiptDropoff').textContent = ride.dropoff;
            document.getElementById('receiptFare').textContent = `₹${ride.totalFare}`;
            document.getElementById('receiptDonation').textContent = `₹${amount}`;
            document.getElementById('receiptRefId').textContent = donation.id;
            document.getElementById('receiptRideAmount').textContent = `₹${ride.totalFare}`;
            document.getElementById('receiptDonationAmount').textContent = `₹${amount}`;
            document.getElementById('receiptTotal').textContent = `₹${totalAmount}`;

            document.getElementById('donationModal').classList.remove('active');
            document.getElementById('receiptModal').classList.add('active');
        }

        function closeReceiptModal() {
            document.getElementById('receiptModal').classList.remove('active');
            window.location.href = './customer-dashboard.html';
        }

        function downloadReceipt() {
            const receiptText = `
GO INDIA RIDE - RECEIPT

========================
RIDE DETAILS
========================
Pickup: ${document.getElementById('receiptPickup').textContent}
Dropoff: ${document.getElementById('receiptDropoff').textContent}
Ride Fare: ${document.getElementById('receiptFare').textContent}

========================
DONATION DETAILS
========================
Donation Amount: ${document.getElementById('receiptDonation').textContent}
Beneficiary: Underprivileged Driver Fund
Reference ID: ${document.getElementById('receiptRefId').textContent}
Date: ${new Date().toLocaleString()}

========================
SUMMARY
========================
Ride Amount: ${document.getElementById('receiptRideAmount').textContent}
+ Donation: ${document.getElementById('receiptDonationAmount').textContent}
Total Paid: ${document.getElementById('receiptTotal').textContent}

Thank you for your generosity! ❤️
            `;

            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(receiptText));
            element.setAttribute('download', 'receipt_' + new Date().getTime() + '.txt');
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);

            alert('✅ Receipt downloaded!');
        }

        function shareReceipt() {
            const donationAmount = document.getElementById('receiptDonation').textContent;
            const shareText = `I just donated ${donationAmount} through GO India RIDE to help underprivileged drivers! 🙏❤️ #GoIndiaRide`;
            
            if (navigator.share) {
                navigator.share({
                    title: 'GO India RIDE Donation',
                    text: shareText
                });
            } else {
                alert('Share: ' + shareText);
            }
        }

        // ============================================
        // MESSAGES
        // ============================================

        function showError(message) {
            document.getElementById('errorText').textContent = message;
            document.getElementById('errorMessage').classList.add('show');
            setTimeout(() => document.getElementById('errorMessage').classList.remove('show'), 5000);
        }

        function showSuccess(message) {
            document.getElementById('successText').textContent = message;
            document.getElementById('successMessage').classList.add('show');
            setTimeout(() => document.getElementById('successMessage').classList.remove('show'), 5000);
        }

        // ============================================
        // DRIVER ACTIONS
        // ============================================

        function callDriver() {
            const phoneText = sanitizeInput(document.getElementById('driverPhone')?.textContent || '').replace(/[^\d+]/g, '');
            if (!phoneText) {
                showError('Driver phone is not available yet.');
                return;
            }
            window.location.href = `tel:${phoneText}`;
        }

        function trackDriver() {
            const pickup = sanitizeInput(document.getElementById('pickup')?.value || '').trim();
            const dropoff = sanitizeInput(document.getElementById('dropoff')?.value || '').trim();
            if (!pickup || !dropoff) {
                showError('Pickup/drop missing for live route tracking.');
                return;
            }
            const origin = getBookingMapQueryValue('pickup') || pickup;
            const destination = getBookingMapQueryValue('dropoff') || dropoff;
            const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
            window.open(url, '_blank', 'noopener');
        }

        // ============================================
        // UTILITY
        // ============================================

        const BOOKING_BACK_GUARD_STATE_KEY = '__goindiaRideBookingBackGuard';
        let bookingBackGuardBound = false;
        let bookingBackGuardRestoring = false;

        function createBookingBackGuardState(role = 'guard') {
            const currentState = history.state && typeof history.state === 'object' ? history.state : {};
            return {
                ...currentState,
                [BOOKING_BACK_GUARD_STATE_KEY]: true,
                bookingBackRole: role,
                bookingBackFlow: typeof getActiveCabFlow === 'function' ? getActiveCabFlow() : 'airport',
                bookingBackStep: Date.now()
            };
        }

        function pushBookingBackGuardState(role = 'guard') {
            if (!window.history || typeof window.history.pushState !== 'function') return false;
            try {
                window.history.pushState(createBookingBackGuardState(role), '', window.location.href);
                return true;
            } catch (_error) {
                return false;
            }
        }

        function replaceBookingBackGuardState(role = 'base') {
            if (!window.history || typeof window.history.replaceState !== 'function') return false;
            try {
                window.history.replaceState(createBookingBackGuardState(role), '', window.location.href);
                return true;
            } catch (_error) {
                return false;
            }
        }

        function stepBackInsideBooking() {
            const moved = typeof handleCabStepBack === 'function' ? handleCabStepBack() : false;
            if (moved) return true;
            resetBookingConsoleHome();
            return false;
        }

        function handleBookingBrowserBack() {
            if (bookingBackGuardRestoring) return;
            bookingBackGuardRestoring = true;

            pushBookingBackGuardState('guard');
            stepBackInsideBooking();
            window.setTimeout(() => {
                bookingBackGuardRestoring = false;
            }, 0);
        }

        function initBookingBackGuard() {
            if (bookingBackGuardBound) return;
            if (!replaceBookingBackGuardState('base')) return;
            if (!pushBookingBackGuardState('guard')) return;

            window.addEventListener('popstate', handleBookingBrowserBack);
            bookingBackGuardBound = true;
        }

        function goBack() {
            stepBackInsideBooking();
        }

        function goCustomerDashboard() {
            window.location.href = './customer-dashboard.html';
        }

        function goHome() {
            resetBookingConsoleHome();
        }

        function resetBookingConsoleHome() {
            const flow = typeof getActiveCabFlow === 'function' ? getActiveCabFlow() : 'airport';
            if (document.body) {
                document.body.classList.remove('booking-advanced-ready');
            }

            const drawer = document.getElementById('advancedBookingDrawer');
            if (drawer) drawer.open = false;

            if (typeof resetCabLayerProgress === 'function') resetCabLayerProgress(flow);
            if (typeof resetServiceFolderProgress === 'function') resetServiceFolderProgress(flow);
            if (typeof syncCabScopedSelectOptions === 'function') syncCabScopedSelectOptions(flow);
            if (typeof syncCabLayerFlow === 'function') syncCabLayerFlow(flow);
            if (typeof syncCabStageLayout === 'function') syncCabStageLayout();
            if (typeof updateBookingExperience === 'function') updateBookingExperience();

            const shell = document.getElementById('cabBookingConsole') || document.querySelector('.container');
            if (shell && typeof shell.scrollIntoView === 'function') {
                shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            const firstField = document.getElementById('cabQuickPickupInput') || document.getElementById('pickup');
            if (firstField && typeof firstField.focus === 'function') {
                window.setTimeout(() => firstField.focus({ preventScroll: true }), 80);
            }
        }

        const BOOKING_HISTORY_REDIRECT_URL = './customer-dashboard.html?tab=history#history';
        let bookingSuccessRedirectIssued = false;

        function redirectToBookingHistory() {
            if (bookingSuccessRedirectIssued) return;
            bookingSuccessRedirectIssued = true;
            window.location.href = BOOKING_HISTORY_REDIRECT_URL;
        }

        function closeSuccessModal() {
            document.getElementById('successModal').classList.remove('active');
            redirectToBookingHistory();
        }

        window.GOINDIARIDE_FORCE_STATIC_FIREBASE_CONFIG = 'false';
        console.log('🚀 Booking page loaded');

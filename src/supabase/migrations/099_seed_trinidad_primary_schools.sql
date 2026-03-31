-- Seed Trinidad primary schools for institution search.
-- Inserts only when a matching institution name does not already exist.

DROP TABLE IF EXISTS tmp_trinidad_primary_schools;

CREATE TEMP TABLE tmp_trinidad_primary_schools (
  name text NOT NULL,
  institution_type text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_trinidad_primary_schools (name, institution_type) VALUES
  ($$Agostini Settlement KPA School$$, 'government_assisted'),
  ($$Siparia Road KPA School$$, 'government_assisted'),
  ($$Anstey Memorial Girls' Anglican School, San Fernando$$, 'government_assisted'),
  ($$Arouca Anglican Primary School, Arouca$$, 'government_assisted'),
  ($$Barataria Anglican Primary School, Barataria$$, 'government_assisted'),
  ($$Brighton Anglican School, La Breacoll$$, 'government_assisted'),
  ($$Cedros Anglican Primary School, Cedros$$, 'government_assisted'),
  ($$Coffee Boys' Anglican School, San Fernando$$, 'government_assisted'),
  ($$Claxton Bay Junior Anglican School, Claxton Bay$$, 'government_assisted'),
  ($$Claxton Bay Senior Anglican School, Claxton Bay$$, 'government_assisted'),
  ($$Couva Anglican School, Couva$$, 'government_assisted'),
  ($$Cumana Anglican School, Cumana Village, Toco$$, 'government_assisted'),
  ($$Eckel Village Anglican School, Williamsville$$, 'government_assisted'),
  ($$Forest Reserve Anglican School, Forest Fyzabad$$, 'government_assisted'),
  ($$Good Shepard Anglican Primary School, Tunapuna$$, 'government_assisted'),
  ($$Grande Riviere Anglican School, Grande Riviere Village, via Toco$$, 'government_assisted'),
  ($$Holy Saviour Curepe Anglican, Curepe$$, 'government_assisted'),
  ($$Marabella Boys' Anglican School, Marabella$$, 'government_assisted'),
  ($$Marabella Girls' Anglican School, Marabella$$, 'government_assisted'),
  ($$Melville Memorial Girls' Anglican School, Belmont$$, 'government_assisted'),
  ($$Morvant Anglican School, Morvant$$, 'government_assisted'),
  ($$Pembroke Anglican School, Port of Spain$$, 'government_assisted'),
  ($$Point Fortin Anglican School, Point Fortin$$, 'government_assisted'),
  ($$Richmond Street Boys' Anglican School (Christus Rex), Port-of-Spain$$, 'government_assisted'),
  ($$San Fernando Girls' Anglican School, San Fernando$$, 'government_assisted'),
  ($$Southern Central Anglican School, Cedros$$, 'government_assisted'),
  ($$St. Christopher's Anglican School, Siparia$$, 'government_assisted'),
  ($$St. Francis boys Roman Catholic$$, 'government_assisted'),
  ($$St Michael's Anglican School, Princes Town$$, 'government_assisted'),
  ($$St John's Anglican Primary School, Cipero Road, San Fernando$$, 'government_assisted'),
  ($$St. Margaret's Boys' School, Belmont$$, 'government_assisted'),
  ($$Sisters Road Anglican School$$, 'government_assisted'),
  ($$St. Paul's Anglican School, San Fernando$$, 'government_assisted'),
  ($$St. Stephen's Anglican School, Princes Town$$, 'government_assisted'),
  ($$St. Ursula's Girls Anglican School, St Vincent street POS$$, 'government_assisted'),
  ($$St. Agnes Anglican School, St. James$$, 'government_assisted'),
  ($$St. Mary's Anglican School, Tacarigua$$, 'government_assisted'),
  ($$St. Catherine Girls' Anglican School Duke Street, POS$$, 'government_assisted'),
  ($$Tableland Anglican (St. Nicholas)$$, 'government_assisted'),
  ($$Toco Anglican, Toco Village, Toco$$, 'government_assisted'),
  ($$ASJA Primary School, Barrackpore$$, 'government_assisted'),
  ($$ASJA Primary School, San Fernando$$, 'government_assisted'),
  ($$ASJA Primary School, Rio Claro$$, 'government_assisted'),
  ($$ASJA Primary School, Point Fortin$$, 'government_assisted'),
  ($$ASJA Primary School, Charlieville$$, 'government_assisted'),
  ($$ASJA Primary School, Carapichaima$$, 'government_assisted'),
  ($$ASJA Primary School, Princes Town$$, 'government_assisted'),
  ($$TML Primary School San Fernando$$, 'government_assisted'),
  ($$TML Primary School St. Joseph$$, 'government_assisted'),
  ($$TML Primary School Libertville$$, 'government_assisted'),
  ($$Arima Presbyterian School, Arima$$, 'government_assisted'),
  ($$Biche Presbyterian School$$, 'government_assisted'),
  ($$Bien Venue Presbyterian School$$, 'government_assisted'),
  ($$Balmain Presbyterian School, Couva$$, 'government_assisted'),
  ($$Bamboo Grove Presbyterian School$$, 'government_assisted'),
  ($$Brothers Presbyterian School, Williamsville$$, 'government_assisted'),
  ($$Bonne Aventure Presbyterian School, Gasparillo$$, 'government_assisted'),
  ($$Canaan Presbyterian School, Duncan Village, San Fernando$$, 'government_assisted'),
  ($$Charlieville Presbyterian School$$, 'government_assisted'),
  ($$Curepe Presbyterian School, Curepe$$, 'government_assisted'),
  ($$Ecclesville Presbyterian Primary School$$, 'government_assisted'),
  ($$Esperanza Presbyterian School, Couva$$, 'government_assisted'),
  ($$Elswick Presbyterian Primary School, Tableland$$, 'government_assisted'),
  ($$Erin Road Presbyterian School$$, 'government_assisted'),
  ($$Exchange Presbyterian School, Couva$$, 'government_assisted'),
  ($$Freeport Presbyterian School$$, 'government_assisted'),
  ($$Fyzabad Presbyterian School$$, 'government_assisted'),
  ($$Grant Memorial Presbyterian School, San Fernando$$, 'government_assisted'),
  ($$Grosvenor Presbyterian School, Sangre Grande$$, 'government_assisted'),
  ($$Inverness Presbyterian School$$, 'government_assisted'),
  ($$Jordan Hill Presbyterian School$$, 'government_assisted'),
  ($$Jubilee Presbyterian School, Guaico Tamana$$, 'government_assisted'),
  ($$Kanhai Presbyterian School$$, 'government_assisted'),
  ($$Lengua Presbyterian School$$, 'government_assisted'),
  ($$McBean Presbyterian School, Couva$$, 'government_assisted'),
  ($$Navet Presbyterian School$$, 'government_assisted'),
  ($$Penal Presbyterian School$$, 'government_assisted'),
  ($$Picton Presbyterian School$$, 'government_assisted'),
  ($$Reform Presbyterian School$$, 'government_assisted'),
  ($$Rochard Douglas Presbyterian School (Barrackpore)$$, 'government_assisted'),
  ($$Rousillac Presbyterian School$$, 'government_assisted'),
  ($$Rio Claro Presbyterian School, Rio Claro$$, 'government_assisted'),
  ($$Saint Julian Presbyterian School$$, 'government_assisted'),
  ($$Sangre Chiquito Presbyterian School$$, 'government_assisted'),
  ($$San Juan Presbyterian School, San Juan$$, 'government_assisted'),
  ($$Santa Cruz Presbyterian School$$, 'government_assisted'),
  ($$Siparia Road Presbyterian School$$, 'government_assisted'),
  ($$Siparia Union Presbyterian School$$, 'government_assisted'),
  ($$Tabaquite Presbyterian School, Tabaquite$$, 'government_assisted'),
  ($$Tunapuna Presbyterian School$$, 'government_assisted'),
  ($$Union Presbyterian School$$, 'government_assisted'),
  ($$Arima Boys' RC School$$, 'government_assisted'),
  ($$Arima Girls' RC School$$, 'government_assisted'),
  ($$Belmont Boys' RC School$$, 'government_assisted'),
  ($$Belmont Girls' RC School$$, 'government_assisted'),
  ($$Biche RC School, New Lands Village, Biche$$, 'government_assisted'),
  ($$Boissiere R.C. School$$, 'government_assisted'),
  ($$Bourg Mulatresse RC School, Santa Cruz$$, 'government_assisted'),
  ($$Brazil RC School$$, 'government_assisted'),
  ($$Carenage Boys R.C$$, 'government_assisted'),
  ($$Caratal Sacred Heart R.C. School$$, 'government_assisted'),
  ($$Chaguanas RC School$$, 'government_assisted'),
  ($$Carapichaima R.C. School$$, 'government_assisted'),
  ($$Chickland RC School Chickland$$, 'government_assisted'),
  ($$Cunapo (St. Francis) RC School, Sangre Grande$$, 'government_assisted'),
  ($$Cumana RC School, Cumana Village, Toco$$, 'government_assisted'),
  ($$Erin RC School$$, 'government_assisted'),
  ($$Exchange RC School Couva$$, 'government_assisted'),
  ($$Flanagin Town RC School Flanagin Town$$, 'government_assisted'),
  ($$Granville RC School, Cedros$$, 'government_assisted'),
  ($$Guayaguayare RC School, Guayaguare$$, 'government_assisted'),
  ($$La Brea RC School$$, 'government_assisted'),
  ($$La Fillette RC School$$, 'government_assisted'),
  ($$Lochmaben RC School, Cedros$$, 'government_assisted'),
  ($$Malick Girls' RC School$$, 'government_assisted'),
  ($$Maraval RC School$$, 'government_assisted'),
  ($$La Lune RC School$$, 'government_assisted'),
  ($$Maria Regina Grade School$$, 'government_assisted'),
  ($$Matelot RC School, Matelot Village, via Toco$$, 'government_assisted'),
  ($$Mayaro (St. Thomas) RC School, Radix Village, Mayaro$$, 'government_assisted'),
  ($$Mayo R.C. School$$, 'government_assisted'),
  ($$Mon Repo RC School$$, 'government_assisted'),
  ($$Mount Russia$$, 'government_assisted'),
  ($$Mucurapo Boys' RC School$$, 'government_assisted'),
  ($$Nelson Street Girls' RC School, Port of Spain$$, 'government_assisted'),
  ($$Nelson Street Boys' RC School, Port of Spain$$, 'government_assisted'),
  ($$Newtown Boys' RC School$$, 'government_assisted'),
  ($$Newtown Girls' RC School$$, 'government_assisted'),
  ($$North Oropouche R.C School, Toco Main Rd$$, 'government_assisted'),
  ($$Ortoire RC School, Ortoire Village, Mayaro$$, 'government_assisted'),
  ($$Paramin RC School$$, 'government_assisted'),
  ($$Petit Valley Boys' R.C School$$, 'government_assisted'),
  ($$Petit Valley Girls' R.C School$$, 'government_assisted'),
  ($$Point Fortin RC School$$, 'government_assisted'),
  ($$Point Cumana RC School$$, 'government_assisted'),
  ($$Poole RC School, Rio Claro$$, 'government_assisted'),
  ($$Princes Town RC School$$, 'government_assisted'),
  ($$Rosary Boys' RC School$$, 'government_assisted'),
  ($$Rampanalgas RC School, Rampanalgas Village, Balandra$$, 'government_assisted'),
  ($$Rose Hill RC School$$, 'government_assisted'),
  ($$St. Dominic's RC School$$, 'government_assisted'),
  ($$South Oropouche RC School$$, 'government_assisted'),
  ($$St. Joseph Boys' RC School$$, 'government_assisted'),
  ($$St. Joseph Girls' RC School$$, 'government_assisted'),
  ($$St. Finbar Girls' RC School, Arouca$$, 'government_assisted'),
  ($$St. Gabriel's Girls' RC School$$, 'government_assisted'),
  ($$St. Mary's Mucurapo Girls' RC School$$, 'government_assisted'),
  ($$St. Pius Boys' RC School, Arouca$$, 'government_assisted'),
  ($$St. Rose's Girls' RC School$$, 'government_assisted'),
  ($$St. Benedict's La Romaine RC School$$, 'government_assisted'),
  ($$St. Theresa's Girls RC School$$, 'government_assisted'),
  ($$St Therese RC School, Rio Claro$$, 'government_assisted'),
  ($$Sacred Heart Girls' RC School$$, 'government_assisted'),
  ($$San Fernando Boys' RC School$$, 'government_assisted'),
  ($$Santa Cruz R.C. School$$, 'government_assisted'),
  ($$The Siparia Boys' R.C. School, Siparia$$, 'government_assisted'),
  ($$Tabaquite RC School$$, 'government_assisted'),
  ($$Toco RC School, Mission Village, Toco$$, 'government_assisted'),
  ($$Todds Road RC School Todds Road$$, 'government_assisted'),
  ($$Tunapuna Boys' RC School$$, 'government_assisted'),
  ($$Tunapuna Girls' RC School$$, 'government_assisted'),
  ($$Upper Guaico RC School, Nestor Village, Guaico Tamana Rd$$, 'government_assisted'),
  ($$San Juan Boys' RC School$$, 'government_assisted'),
  ($$San Juan Girls RC School$$, 'government_assisted'),
  ($$San Souci RC School, San Souci Village, via Toco$$, 'government_assisted'),
  ($$St. Brigid's Girls R.C School$$, 'government_assisted'),
  ($$Success R.C.School, Laventile$$, 'government_assisted'),
  ($$Vance River RC School$$, 'government_assisted'),
  ($$Debe Hindu School$$, 'government_assisted'),
  ($$Sangre Grande Hindu School$$, 'government_assisted'),
  ($$El Socorro Hindu School$$, 'government_assisted'),
  ($$El Dorado North Hindu School$$, 'government_assisted'),
  ($$El Dorado South Hindu School$$, 'government_assisted'),
  ($$Orange Field Hindu School$$, 'government_assisted'),
  ($$Rio Claro Hindu School, Rio Claro$$, 'government_assisted'),
  ($$McBean Hindu School, Couva$$, 'government_assisted'),
  ($$Ramai Trace Hindu School, Ramai Trace Debe$$, 'government_assisted'),
  ($$Riverside* Hindu School$$, 'government_assisted'),
  ($$Robert Village Hindu School$$, 'government_assisted'),
  ($$Spring Village Hindu School$$, 'government_assisted'),
  ($$Freeport Hindu School$$, 'government_assisted'),
  ($$Felicity Hindu School$$, 'government_assisted'),
  ($$Munroe Road Hindu School$$, 'government_assisted'),
  ($$Reform Hindu School$$, 'government_assisted'),
  ($$Mohess Road Hindu School$$, 'government_assisted'),
  ($$Tulsa Trace Hindu School$$, 'government_assisted'),
  ($$Suchit Trace Hindu School$$, 'government_assisted'),
  ($$Rousillac Hindu School$$, 'government_assisted'),
  ($$Arima Boys' Government Primary School, Arima$$, 'public'),
  ($$Arima Girls' Government Primary School, Arima$$, 'public'),
  ($$Arima New Government Primary School$$, 'public'),
  ($$Brasso Venado Government Primary School$$, 'public'),
  ($$Belmont Government Primary School$$, 'public'),
  ($$Cedros Government Primary School, Cedros$$, 'public'),
  ($$Chatham Government Primary School, Cedros$$, 'public'),
  ($$Chaguanas Government Primary School$$, 'public'),
  ($$Clarke Rochard Government, Penal$$, 'public'),
  ($$Cocoyea Government, Cocoyea Village, San Fernando$$, 'public'),
  ($$Couva South Government Primary School$$, 'public'),
  ($$Crystal Stream Government$$, 'public'),
  ($$Cunjal Government, Barrackpore$$, 'public'),
  ($$Cunupia Government Primary School$$, 'public'),
  ($$D'Abadie Government Primary School, D'Abadie$$, 'public'),
  ($$Diamond Vale Government Primary, Diego Martin$$, 'public'),
  ($$Diego Martin Government Primary School$$, 'public'),
  ($$Dinsley Trincity Government Primary School$$, 'public'),
  ($$Dow Village Government Primary School$$, 'public'),
  ($$Guaico Government Primary, Guaico Village, Sangre Grande$$, 'public'),
  ($$Egypt Village Government Primary School, Point Fortin$$, 'public'),
  ($$El Socorro North Government Primary School$$, 'public'),
  ($$Fanny Village Government Primary School, Point Fortin$$, 'public'),
  ($$Icacos Government Primary School, Cedros$$, 'public'),
  ($$Jerningham Government Primary School$$, 'public'),
  ($$La Horquetta North Government Primary School$$, 'public'),
  ($$La Horquetta South Government Primary School$$, 'public'),
  ($$Longdenville Government Primary School, Longdenville$$, 'public'),
  ($$La Puerta Government Primary School, Diego Martin$$, 'public'),
  ($$Macaulay Government Primary School, Macaulay, Claxton Bay$$, 'public'),
  ($$Mafeking Government Primary School, Mafeking Village, Mayaro$$, 'public'),
  ($$Malabar Government Primary School, Malabar, Arima$$, 'public'),
  ($$Maloney Government Primary School, Maloney$$, 'public'),
  ($$Matura Government Primary School, Matura Village$$, 'public'),
  ($$Mayaro Government Primary School, Mayaro$$, 'public'),
  ($$Monkey Town Government Primary School, Barrackpore$$, 'public'),
  ($$Monte Video Government Primary, Monte Video Village, via Toco$$, 'public'),
  ($$Mount Pleasant Government School, Solidad Rd, Claxton Bay$$, 'public'),
  ($$North Oropouche Government Primary School$$, 'public'),
  ($$Raghunanan Road Government Primary School$$, 'public'),
  ($$Tortuga Government Primary School$$, 'public'),
  ($$Tranquility Government Primary School$$, 'public'),
  ($$Vos Government Primary School, Gasparillo$$, 'public'),
  ($$Gasparillo Government Primary School, Gasparillo$$, 'public'),
  ($$San Fernando Girl's Government Primary School, San Fernando$$, 'public'),
  ($$San Fernando Boy's Government Primary School, San Fernando$$, 'public'),
  ($$Adonis Academy (Leviticus Academy) Arima, Trinidad$$, 'private'),
  ($$Ambassador College Private School$$, 'private'),
  ($$Apex International Academy, Chaguanas, Trinidad$$, 'private'),
  ($$Arbor, Maraval$$, 'private'),
  ($$Christian Primary Academy, Arouca$$, 'private'),
  ($$Beach Camp Community School, Palo Seco$$, 'private'),
  ($$Bishop Anstey Junior, Port of Spain$$, 'private'),
  ($$Blackman's Private School, Maraval, Port of Spain$$, 'private'),
  ($$Bryn Mawr Private School, Petite Valley$$, 'private'),
  ($$Cedar Grove Private Primary School, Palmiste, San Fernando$$, 'private'),
  ($$Elders' Classes, Port of Spain$$, 'private'),
  ($$Eniath's Montessori and Prep School, Lange Park, Chaguanas$$, 'private'),
  ($$Explorers Childcare Academy (Lange Park, Chaguanas)$$, 'private'),
  ($$Holy Rosary Preparatory, St. James$$, 'private'),
  ($$Personal Tutoring Institute, Arima$$, 'private'),
  ($$Precious Little Angels, Port of Spain$$, 'private'),
  ($$Savonetta Private School, San Fernando$$, 'private'),
  ($$The Giuseppi Preparatory School, Arima$$, 'private'),
  ($$Nova Satus Private School, Cunupia$$, 'private'),
  ($$Holy Faith Preparatory, Port of Spain$$, 'private'),
  ($$Holy Name Preparatory, Port of Spain$$, 'private'),
  ($$Marabella Learning Centre$$, 'private'),
  ($$St. Peter's Private Primary School, Pointe-a-Pierre$$, 'private'),
  ($$International School of Port of Spain$$, 'private'),
  ($$SuJo's Private School, Woodbrook$$, 'private'),
  ($$Specialist Learning Center$$, 'private'),
  ($$Christian Primary Academy, Trinidad$$, 'private'),
  ($$Regulus Educational Academy, Chaguanas$$, 'private'),
  ($$Scholars Private Primary and Pre School (Tacarigua)$$, 'private'),
  ($$Scholastic Academy, St. Augustine$$, 'private'),
  ($$St. Andrew's Private School, Maraval$$, 'private'),
  ($$St. Joseph Terrace Private School, San Fernando$$, 'private'),
  ($$St. Xavier's Private School, St. Joseph$$, 'private'),
  ($$St. Monica's Preparatory, Port of Spain$$, 'private'),
  ($$St. Catherine's Private School, Woodbrook$$, 'private'),
  ($$Student Remediation Centre, Marabella, San Fernando$$, 'private'),
  ($$The Trinidad Renaissance School, San Fernando$$, 'private'),
  ($$The University School, St. Augustine$$, 'private'),
  ($$Waterman's Preparatory School, La Romain$$, 'private'),
  ($$Dunross Preparatory School$$, 'private'),
  ($$Athenias Presecondary School, St Augustine$$, 'private'),
  ($$Sevilla Private Primary School, Sevilla Compound, Rivulet Road, Brechin Castle, Couva$$, 'private'),
  ($$Scholars Private Primary and Pre-School, Tacarigua$$, 'private'),
  ($$Mayaro Guayaguayare Community School$$, 'private'),
  ($$St. Hilary's Preparatory School$$, 'private'),
  ($$Windermere Private School$$, 'private');

DO $$
DECLARE
  type_constraint_def text;
BEGIN
  SELECT pg_get_constraintdef(con.oid)
  INTO type_constraint_def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'institutions'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%institution_type%'
  LIMIT 1;

  IF coalesce(type_constraint_def, '') ILIKE '%''assisted''%' THEN
    UPDATE tmp_trinidad_primary_schools
    SET institution_type = 'assisted'
    WHERE institution_type = 'government_assisted';
  END IF;

  IF coalesce(type_constraint_def, '') ILIKE '%''government''%' THEN
    UPDATE tmp_trinidad_primary_schools
    SET institution_type = 'government'
    WHERE institution_type = 'public';
  END IF;
END $$;

DO $$
DECLARE
  level_constraint_name text;
  level_constraint_def text;
BEGIN
  SELECT con.conname, pg_get_constraintdef(con.oid)
  INTO level_constraint_name, level_constraint_def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'institutions'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%institution_level%'
  LIMIT 1;

  IF level_constraint_name IS NOT NULL
     AND coalesce(level_constraint_def, '') NOT ILIKE '%''primary''%' THEN
    EXECUTE format(
      'ALTER TABLE public.institutions DROP CONSTRAINT %I',
      level_constraint_name
    );

    EXECUTE $sql$
      ALTER TABLE public.institutions
      ADD CONSTRAINT institutions_institution_level_check
      CHECK (institution_level IN ('primary', 'secondary', 'tertiary', 'other'))
    $sql$;
  END IF;
END $$;

DO $$
DECLARE
  has_normalized_name boolean;
  has_island boolean;
  has_region boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institutions'
      AND column_name = 'normalized_name'
  ) INTO has_normalized_name;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institutions'
      AND column_name = 'island'
  ) INTO has_island;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institutions'
      AND column_name = 'region'
  ) INTO has_region;

  IF has_normalized_name AND has_island AND has_region THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        normalized_name,
        institution_level,
        institution_type,
        country_code,
        island,
        region,
        is_active
      )
      SELECT
        s.name,
        regexp_replace(lower(trim(s.name)), '\s+', ' ', 'g'),
        'primary',
        s.institution_type,
        'TT',
        'Trinidad',
        NULL,
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_normalized_name AND has_island THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        normalized_name,
        institution_level,
        institution_type,
        country_code,
        island,
        is_active
      )
      SELECT
        s.name,
        regexp_replace(lower(trim(s.name)), '\s+', ' ', 'g'),
        'primary',
        s.institution_type,
        'TT',
        'Trinidad',
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_normalized_name AND has_region THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        normalized_name,
        institution_level,
        institution_type,
        country_code,
        region,
        is_active
      )
      SELECT
        s.name,
        regexp_replace(lower(trim(s.name)), '\s+', ' ', 'g'),
        'primary',
        s.institution_type,
        'TT',
        NULL,
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_normalized_name THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        normalized_name,
        institution_level,
        institution_type,
        country_code,
        is_active
      )
      SELECT
        s.name,
        regexp_replace(lower(trim(s.name)), '\s+', ' ', 'g'),
        'primary',
        s.institution_type,
        'TT',
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_island AND has_region THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        institution_level,
        institution_type,
        country_code,
        island,
        region,
        is_active
      )
      SELECT
        s.name,
        'primary',
        s.institution_type,
        'TT',
        'Trinidad',
        NULL,
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_island THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        institution_level,
        institution_type,
        country_code,
        island,
        is_active
      )
      SELECT
        s.name,
        'primary',
        s.institution_type,
        'TT',
        'Trinidad',
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_region THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        institution_level,
        institution_type,
        country_code,
        region,
        is_active
      )
      SELECT
        s.name,
        'primary',
        s.institution_type,
        'TT',
        NULL,
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSE
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        institution_level,
        institution_type,
        country_code,
        is_active
      )
      SELECT
        s.name,
        'primary',
        s.institution_type,
        'TT',
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  END IF;
END $$;

-- PASTE THIS INTO CUSTOMER.IO'S QUERY EDITOR. Nothing else from the v2 file.
-- Full reasoning + backfill instructions: scripts/customerio-warehouse-sync.sql
-- FIRST RUN ONLY: replace the WHERE line below with  WHERE TRUE  to backfill,
-- then put it back. An incremental first run returns 0 rows.

SELECT
    v.customer_id                               AS "userId",
    v.email                                     AS "email",
    v.full_name                                 AS "traits.full_name",
    v.first_name                                AS "traits.first_name",
    v.username                                  AS "traits.username",
    v.phone_number                              AS "traits.phone",
    v.account_type                              AS "traits.role",
    v.country                                   AS "traits.country",
    v.region                                    AS "traits.region",
    v.school                                    AS "traits.school",
    v.education_level                           AS "traits.grade_level",
    v.subjects_of_study                         AS "traits.subjects_of_study",
    v.tutor_subject_names                       AS "traits.tutor_subjects",
    v.primary_subject                           AS "traits.primary_subject",
    v.teaching_levels                           AS "traits.teaching_levels",
    v.tutor_type                                AS "traits.tutor_type",
    v.teaching_mode                             AS "traits.teaching_mode",
    v.tutor_verification_status                 AS "traits.tutor_verification_status",
    v.rating_average                            AS "traits.rating_average",
    v.rating_count                              AS "traits.rating_count",
    v.billing_mode                              AS "traits.billing_mode",
    v.is_suspended                              AS "traits.is_suspended",
    v.is_dev_account                            AS "traits.is_dev_account",
    v.signup_ref                                AS "traits.signup_ref",
    v.first_touch ->> 'utm_source'              AS "traits.utm_source",
    v.first_touch ->> 'utm_campaign'            AS "traits.utm_campaign",
    v.profile_complete                          AS "traits.profile_complete",
    v.classes_joined_count                      AS "traits.classes_joined_count",
    v.classes_created_count                     AS "traits.classes_created_count",
    v.published_classes_count                   AS "traits.published_classes_count",
    v.first_class_id                            AS "traits.first_class_id",
    v.first_class_name                          AS "traits.first_class_name",
    CASE WHEN v.first_class_id IS NOT NULL
         THEN 'https://myitutor.com/student/explore/' || v.first_class_id::text
    END                                         AS "traits.first_class_url",
    v.class_has_schedule                        AS "traits.class_has_schedule",
    v.class_has_start_date                      AS "traits.class_has_start_date",
    v.class_has_banner                          AS "traits.class_has_banner",
    v.class_first_session_at                    AS "traits.class_first_session_at",
    v.class_next_session_at                     AS "traits.class_next_session_at",
    v.child_id                                  AS "traits.child_id",
    v.child_name                                AS "traits.child_name",
    v.child_level                               AS "traits.child_level",
    v.child_primary_subject                     AS "traits.child_primary_subject",
    v.child_classes_joined_count                AS "traits.child_classes_joined_count",
    v.children_count                            AS "traits.children_count",
    v.last_viewed_class_id                      AS "traits.last_viewed_class_id",
    v.last_viewed_class_name                    AS "traits.last_viewed_class_name",
    CASE WHEN v.last_viewed_class_id IS NOT NULL
         THEN 'https://myitutor.com/student/explore/' || v.last_viewed_class_id::text
    END                                         AS "traits.last_viewed_class_url",
    v.last_viewed_tutor_name                    AS "traits.last_viewed_tutor_name",
    v.last_viewed_subject                       AS "traits.last_viewed_subject",
    v.last_class_viewed_at                      AS "traits.last_class_viewed_at",
    v.marketing_consent                         AS "traits.marketing_opt_in",
    v.marketing_consent_source                  AS "traits.marketing_consent_source",
    CASE WHEN v.marketing_consent IS FALSE THEN TRUE END
                                                AS "traits.unsubscribed",
    TO_CHAR(v.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                                AS "timestamp",
    v.customer_id::text || ':' ||
      EXTRACT(EPOCH FROM v.activation_updated_at)::bigint::text
                                                AS "messageId"
FROM public.customerio_profiles_v1 v
WHERE EXTRACT(EPOCH FROM v.activation_updated_at) > {{last_sync_time}}
  AND v.email IS NOT NULL
  AND TRIM(v.email) <> ''
  AND v.is_dev_account = FALSE
  AND v.email NOT ILIKE '%@demo.itutor.test'
  AND v.email NOT ILIKE '%.test'
  AND v.email NOT ILIKE '%@example.com';

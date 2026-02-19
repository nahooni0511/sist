package com.sistrun.launcher

data class WorkoutAppCard(
    val packageName: String,
    val name: String,
    val description: String,
    val imageUrl: String? = null,
    val fallbackImageResId: Int
)

object WorkoutAppCatalog {
    // TODO: Replace this with API response mapping when the server endpoint is ready.
    fun getApps(): List<WorkoutAppCard> = listOf(
        WorkoutAppCard(
            packageName = "com.sistrun.standhold",
            name = "SISTRUN FIT",
            description = "전신 운동 루틴을 안내하고 실시간 자세 피드백을 제공합니다.",
            imageUrl = "file:///android_asset/fit.jpeg",
            fallbackImageResId = R.drawable.bg_workout_card_fallback_1
        ),
        WorkoutAppCard(
            packageName = "com.sistrun.dance",
            name = "SISTRUN DANCE",
            description = "댄스 챌린지 기반 유산소 트레이닝으로 재미있게 운동하세요.",
            imageUrl = "file:///android_asset/dance.jpeg",
            fallbackImageResId = R.drawable.bg_workout_card_fallback_2
        ),
        WorkoutAppCard(
            packageName = "com.yourcompany.peboard",
            name = "PE BOARD",
            description = "체육 수업용 타이머, 점수판, 사운드 도구를 한 번에 실행합니다.",
            imageUrl = "file:///android_asset/pe_board.jpeg",
            fallbackImageResId = R.drawable.bg_workout_card_fallback_3
        ),
        WorkoutAppCard(
            packageName = "com.sistrun.integratetest",
            name = "INTEGRATE TEST",
            description = "스쿼트/멀리뛰기 측정 연동과 측정값 표시를 확인하는 테스트 앱입니다.",
            imageUrl = "file:///android_asset/test.jpeg",
            fallbackImageResId = R.drawable.bg_workout_card_fallback_1
        ),
        WorkoutAppCard(
            packageName = "com.example.fluttter_data_park",
            name = "SISTRUN PAPS",
            description = "PAPS 측정 어플리케이션입니다.",
            imageUrl = "file:///android_asset/test.jpeg",
            fallbackImageResId = R.drawable.bg_workout_card_fallback_1
        )
    )
}

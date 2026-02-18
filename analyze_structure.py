#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import csv
import sys
import io

# Windows 환경에서 UTF-8 출력 설정
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def analyze_csv_structure(filename):
    with open(filename, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        rows = list(reader)
        
        if len(rows) == 0:
            print("파일이 비어있습니다.")
            return
        
        first_row = rows[0]
        second_row = rows[1] if len(rows) > 1 else None
        
        print("=" * 80)
        print("CSV 파일 구조 분석")
        print("=" * 80)
        print(f"\n총 행 수: {len(rows)}")
        print(f"총 컬럼 수: {len(first_row)}")
        print("\n" + "=" * 80)
        print("컬럼 구조:")
        print("=" * 80)
        
        # 컬럼 이름 추정
        column_names = [
            "컬럼1 (ID?)",
            "컬럼2 (ID?)",
            "컬럼3 (ID?)",
            "컬럼4 (영어 키워드)",
            "컬럼5 (한자)",
            "컬럼6 (이미지 태그)",
            "컬럼7 (빈 컬럼)",
            "컬럼8 (영어 키워드 대문자)",
            "컬럼9 (숫자?)",
            "컬럼10 (숫자?)",
            "컬럼11 (설명 - 영어)",
            "컬럼12 (원시 요소 설명)",
            "컬럼13 (짧은 설명)",
            "컬럼14 (학습 스토리)",
            "컬럼15 (숫자?)",
            "컬럼16 (숫자?)",
            "컬럼17 (음독 - 히라가나/가타카나)",
            "컬럼18 (훈독 - 히라가나)",
            "컬럼19 (예문 - HTML 형식)",
            "컬럼20 (읽기 예시)",
            "컬럼21 (음독 - 로마자)",
            "컬럼22 (훈독 - 로마자)",
            "컬럼23 (한글 이름 - 기존)",
            "컬럼24 (한글 이름 - 새로 추가)",
            "컬럼25 (JLPT 레벨)"
        ]
        
        for i, (name, value) in enumerate(zip(column_names, first_row)):
            # 값이 너무 길면 잘라서 표시
            display_value = value[:60] + "..." if len(value) > 60 else value
            if not display_value:
                display_value = "(빈 값)"
            
            print(f"\n[{i+1:2d}] {name}")
            print(f"     예시 값: {display_value}")
            
            # 두 번째 행의 값도 표시 (다를 수 있음)
            if second_row and i < len(second_row):
                second_value = second_row[i][:60] + "..." if len(second_row[i]) > 60 else second_row[i]
                if second_value != value:
                    print(f"     (2행 예시: {second_value})")
        
        print("\n" + "=" * 80)
        print("주요 컬럼 상세:")
        print("=" * 80)
        
        print("\n" + "=" * 80)
        print("주요 컬럼 상세 분석:")
        print("=" * 80)
        
        # 주요 컬럼 상세 분석 (인덱스는 0부터 시작)
        key_columns = {
            3: "영어 키워드 (keyword)",
            4: "한자 (kanji)",
            16: "음독 - 히라가나/가타카나 (on-yomi)",
            17: "훈독 - 히라가나 (kun-yomi)",
            19: "예문 - HTML 형식 (examples)",
            20: "읽기 예시 (reading examples)",
            21: "음독 - 로마자 (on-yomi romaji)",
            22: "훈독 - 로마자 (kun-yomi romaji)",
            22: "한글 이름 - 기존 (korean_name_old)",
            23: "한글 이름 - 새로 추가 (korean_name_new)",
            24: "JLPT 레벨 (jlpt_level)"
        }
        
        for col_idx, col_name in key_columns.items():
            if col_idx < len(first_row):
                print(f"\n[{col_idx+1}] {col_name}:")
                val1 = first_row[col_idx][:100] + "..." if len(first_row[col_idx]) > 100 else first_row[col_idx]
                print(f"    첫 번째 행: {val1}")
                if second_row and col_idx < len(second_row):
                    val2 = second_row[col_idx][:100] + "..." if len(second_row[col_idx]) > 100 else second_row[col_idx]
                    print(f"    두 번째 행: {val2}")

if __name__ == "__main__":
    analyze_csv_structure("Heisigs RTK 6th Edition Korean.csv")
